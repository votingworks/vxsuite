import { assert, assertDefined } from '@votingworks/basics';
import {
  AdjudicationReasonInfo,
  DEFAULT_MINIMUM_DETECTED_BALLOT_SCALE,
  Id,
  mapSheet,
  PageInterpretationWithFiles,
  pollingPlaceFromElection,
  pollingPlacePrecinctIds,
  SheetInterpretation,
  SheetOf,
} from '@votingworks/types';
import makeDebug from 'debug';
import * as fsExtra from 'fs-extra';
import { join } from 'node:path';
import { randomUUID as uuid } from 'node:crypto';
import {
  combinePageInterpretationsForSheet,
  interpretSheetAndSaveImages,
} from '@votingworks/ballot-interpreter';
import { LogEventId, Logger, LogLine } from '@votingworks/logging';
import { loadImageData } from '@votingworks/image-utils';
import {
  assign,
  createMachine,
  DoneInvokeEvent,
  EventObject,
  interpret,
  InterpreterFrom,
} from 'xstate';
import { waitFor } from 'xstate/lib/waitFor.js';
import {
  BatchControl,
  BatchScanner,
  ScannedSheetInfo,
} from './fujitsu_scanner.js';
import { Workspace } from './util/workspace.js';
import {
  describeValidationError,
  validateSheetInterpretation,
} from './validation.js';
import { BatchPauseReason, BatchScannerMachineStatus } from './types.js';

const debug = makeDebug('scan:state-machine');

interface BatchContext {
  control: BatchControl;
  imageDirectory: string;
  chunkIndex: number;
}

interface Context {
  batchId?: Id;
  batchContext?: BatchContext;
  scannedSheet?: ScannedSheetInfo;
  pauseReason?: BatchPauseReason;
  error?: Error;
}

type Event =
  | { type: 'START_BATCH' }
  | { type: 'PAUSE_BATCH' }
  | { type: 'RESUME_BATCH' }
  | { type: 'SAVE_BATCH' }
  | { type: 'DISCARD_BATCH' }
  | { type: 'ACCEPT_SHEET' }
  | { type: 'REJECT_SHEET' };

type DoneEvent<F extends (...args: never[]) => Promise<unknown>> =
  DoneInvokeEvent<Awaited<ReturnType<F>>>;
type ErrorEvent = DoneInvokeEvent<Error>;

const assignError = assign((_context: Context, event: ErrorEvent) => ({
  error: event.data,
}));

const catchError = { target: '#error', actions: assignError } as const;

export interface BatchScannerStateMachine {
  status(): BatchScannerMachineStatus;

  startBatch(): Promise<void>;
  pauseBatch(): Promise<void>;
  resumeBatch(): Promise<void>;
  saveBatch(): Promise<void>;
  discardBatch(): Promise<void>;
  acceptSheet(): Promise<void>;
  rejectSheet(): Promise<void>;

  // Stop the state machine and release any resources it is using.
  stop(): void;
}

function buildMachine({
  scanner,
  workspace,
  logger,
}: {
  scanner: BatchScanner;
  workspace: Workspace;
  logger: Logger;
}) {
  const { store } = workspace;

  async function startScanning(
    imageDirectory: string,
    batchId: Id,
    chunkIndex: number
  ): Promise<BatchContext> {
    const hasImprinter = await scanner.isImprinterAttached();
    logger.log(LogEventId.ImprinterStatus, 'system', {
      message: `Imprinter is ${hasImprinter ? 'attached' : 'not attached'}.`,
    });
    return {
      control: scanner.scanSheets({
        directory: imageDirectory,
        pageSize: store.getBallotPaperSizeForElection(),
        // If the imprinter is attached, imprint an ID prefixed by the batch ID
        // and chunk index. The scanner restarts its imprint counter each time
        // we tell it to start a batch, so we add a chunk index to ensure unique
        // imprint IDs within our logical batch.
        imprintIdPrefix: hasImprinter ? `${batchId}_${chunkIndex}` : undefined,
      }),
      imageDirectory,
      chunkIndex,
    };
  }

  async function startBatch(batchId: Id): Promise<BatchContext> {
    const imageDirectory = join(workspace.ballotImagesPath, `batch-${batchId}`);
    await fsExtra.ensureDir(imageDirectory);
    const batchContext = await startScanning(imageDirectory, batchId, 0);
    void logger.logAsCurrentRole(LogEventId.ScannerBatchStarted, {
      disposition: 'success',
      message: `User has begun scanning a new batch with ID: ${batchId}`,
      batchId,
    });
    return batchContext;
  }

  async function resumeBatch({
    batchId,
    batchContext,
  }: Context): Promise<BatchContext> {
    const { control, imageDirectory, chunkIndex } = assertDefined(batchContext);
    // Since the scanner ends its "batch" internally when the tray runs out of paper,
    // we need to start a new scanner batch when resuming after that. If we
    // paused for another reason (e.g. manual pause or adjudication), then we
    // need to end the current scanner batch before starting a new one.
    await control.endBatch();
    return startScanning(
      imageDirectory,
      assertDefined(batchId),
      chunkIndex + 1
    );
  }

  async function interpretAndSaveSheet(
    batchId: Id,
    sheet: ScannedSheetInfo
  ): Promise<{ sheetId: Id; interpretation: SheetInterpretation }> {
    const start = Date.now();
    const sheetId = uuid();
    debug('interpreting sheet %o for batch %s as %s', sheet, batchId, sheetId);

    const { electionDefinition } = assertDefined(store.getElectionRecord());
    const { election } = electionDefinition;
    const {
      allowOfficialBallotsInTestMode,
      disableVerticalStreakDetection,
      markThresholds,
      minimumDetectedBallotScaleOverride,
      maxCumulativeStreakWidth,
      retryStreakWidthThreshold,
    } = assertDefined(store.getSystemSettings());
    const pollingPlaceId = assertDefined(store.getPollingPlaceId());

    const [frontImageData, backImageData] = await Promise.all([
      loadImageData(sheet.frontPath),
      loadImageData(sheet.backPath),
    ]);
    let pages: SheetOf<PageInterpretationWithFiles> =
      await interpretSheetAndSaveImages(
        {
          electionDefinition,
          validPrecinctIds: pollingPlacePrecinctIds(
            pollingPlaceFromElection(election, pollingPlaceId)
          ),
          testMode: store.getTestMode(),
          disableVerticalStreakDetection,
          adjudicationReasons: store.getAdjudicationReasons(),
          markThresholds,
          allowOfficialBallotsInTestMode,
          minimumDetectedScale:
            minimumDetectedBallotScaleOverride ??
            DEFAULT_MINIMUM_DETECTED_BALLOT_SCALE,
          maxCumulativeStreakWidth,
          retryStreakWidthThreshold,
        },
        [frontImageData.unsafeUnwrap(), backImageData.unsafeUnwrap()],
        sheetId,
        workspace.ballotImagesPath
      );
    for (const { imagePath, interpretation } of pages) {
      debug(
        'interpreted %s (%s): %O',
        imagePath,
        interpretation.type,
        interpretation
      );
    }

    const validationResult = validateSheetInterpretation(
      mapSheet(pages, ({ interpretation }) => interpretation)
    );
    // @coverage-defer
    if (validationResult.isErr()) {
      const error = validationResult.err();
      const errDescription = describeValidationError(error);
      debug(
        'rejecting sheet because it would not produce a valid CVR: error=%s: %o',
        errDescription,
        error
      );
      // Replace interpretation with something that cannot be accepted
      pages = mapSheet(pages, ({ imagePath }): PageInterpretationWithFiles => ({
        imagePath,
        interpretation: {
          type: 'UnreadablePage',
          reason: `invalid CVR: ${errDescription}`,
        },
      }));
    }

    const [frontPageNumber, backPageNumber] = mapSheet(
      pages,
      ({ interpretation }) =>
        'metadata' in interpretation && 'pageNumber' in interpretation.metadata
          ? interpretation.metadata.pageNumber
          : undefined
    );
    // @coverage-defer
    if (
      frontPageNumber !== undefined &&
      backPageNumber !== undefined &&
      frontPageNumber > backPageNumber
    ) {
      pages = [pages[1], pages[0]];
    }
    const sheetInterpretation = combinePageInterpretationsForSheet(
      mapSheet(pages, ({ interpretation }) => interpretation),
      election
    );
    store.addSheet(sheetId, batchId, pages, sheet.ballotAuditId);

    debug(
      'imported sheet %o for batch %s in %dms',
      sheet,
      batchId,
      Date.now() - start
    );
    return { sheetId, interpretation: sheetInterpretation };
  }

  async function endBatch(batchContext: BatchContext): Promise<void> {
    const { control, imageDirectory } = batchContext;
    try {
      await control.endBatch();
    } finally {
      await fsExtra.remove(imageDirectory);
    }
  }

  async function saveBatch({ batchId, batchContext }: Context): Promise<void> {
    assert(batchId !== undefined);
    await endBatch(assertDefined(batchContext));
    store.finishBatch(batchId);
    const batch = store.getBatch(batchId);
    void logger.logAsCurrentRole(LogEventId.ScannerBatchEnded, {
      disposition: 'success',
      message: `Scanning batch ${batch.id} successfully completed scanning ${batch.count} sheets.`,
      batchId: batch.id,
      sheetCount: batch.count,
      scanningEndedAt: batch.endedAt,
    });
  }

  async function discardBatch({
    batchId,
    batchContext,
  }: Context): Promise<void> {
    if (batchContext) await endBatch(batchContext);
    store.deleteBatch(assertDefined(batchId));
  }

  const clearBatch = assign<Context, Event>({
    batchId: undefined,
    batchContext: undefined,
    scannedSheet: undefined,
    pauseReason: undefined,
  });

  const clearError = assign<Context, Event>({
    error: undefined,
  });

  return createMachine<Context, Event>({
    id: 'batch_scanner',
    strict: true,
    predictableActionArguments: true,

    context: {},

    initial: 'idle',
    states: {
      idle: {
        id: 'idle',
        entry: [clearBatch, clearError],
        on: {
          START_BATCH: {
            target: 'startingBatch',
            actions: assign((_context) => ({ batchId: store.addBatch() })),
          },
        },
      },

      startingBatch: {
        invoke: {
          src: (context) => startBatch(assertDefined(context.batchId)),
          onDone: {
            target: 'scanningSheet',
            actions: assign(
              (_context, event: DoneEvent<typeof startBatch>) => ({
                batchContext: event.data,
              })
            ),
          },
          onError: catchError,
        },
        on: {
          PAUSE_BATCH: {
            actions: assign({
              pauseReason: (_context) => ({ type: 'manual' }),
            }),
          },
        },
      },

      scanningSheet: {
        id: 'scanningSheet',
        entry: assign({
          scannedSheet: undefined,
        }),
        on: {
          // If we get a manual pause during scanning, record it but allow
          // scanning to continue so we can be sure that the ballot that ran
          // through the scanner already got counted.
          PAUSE_BATCH: {
            actions: assign({
              pauseReason: (_context) => ({ type: 'manual' }),
            }),
          },
        },
        invoke: {
          src: (context) =>
            assertDefined(context.batchContext).control.scanSheet(),
          onDone: [
            {
              cond: (_context, event: DoneEvent<BatchControl['scanSheet']>) =>
                event.data === undefined,
              target: 'paused',
              actions: assign({
                pauseReason: (_context) => ({ type: 'tray-empty' }),
              }),
            },
            {
              target: 'interpretingSheet',
              actions: assign({
                scannedSheet: (
                  _context,
                  event: DoneEvent<BatchControl['scanSheet']>
                ) => event.data,
              }),
            },
          ],
          onError: catchError,
        },
      },

      interpretingSheet: {
        on: {
          PAUSE_BATCH: {
            actions: assign({
              pauseReason: (_context) => ({ type: 'manual' }),
            }),
          },
        },
        invoke: {
          src: (context) =>
            interpretAndSaveSheet(
              assertDefined(context.batchId),
              assertDefined(context.scannedSheet)
            ),
          onDone: [
            // Handle any manual pauses that occurred during scanning/interpretation
            {
              cond: (context, event: DoneEvent<typeof interpretAndSaveSheet>) =>
                event.data.interpretation.type === 'ValidSheet' &&
                context.pauseReason?.type === 'manual',
              target: 'paused',
            },
            {
              cond: (
                _context,
                event: DoneEvent<typeof interpretAndSaveSheet>
              ) => event.data.interpretation.type === 'ValidSheet',
              target: 'scanningSheet',
            },
            {
              target: 'sheetNeedsReview',
              actions: assign({
                pauseReason: (
                  _context,
                  event: DoneEvent<typeof interpretAndSaveSheet>
                ) => ({ type: 'review', sheetId: event.data.sheetId }),
              }),
            },
          ],
          onError: catchError,
        },
      },

      sheetNeedsReview: {
        on: {
          ACCEPT_SHEET: 'paused',
          REJECT_SHEET: {
            target: 'paused',
            actions: (context) => {
              assert(context.pauseReason?.type === 'review');
              store.deleteSheet(context.pauseReason.sheetId);
            },
          },
        },
      },

      paused: {
        initial: 'paused',
        states: {
          paused: {
            on: {
              RESUME_BATCH: 'resuming',
              SAVE_BATCH: 'saving',
              DISCARD_BATCH: 'discarding',
            },
          },
          resuming: {
            invoke: {
              src: resumeBatch,
              onDone: {
                target: '#scanningSheet',
                actions: assign(
                  (_context, event: DoneEvent<typeof resumeBatch>) => ({
                    pauseReason: undefined,
                    batchContext: event.data,
                  })
                ),
              },
              onError: catchError,
            },
          },
          saving: {
            invoke: {
              src: saveBatch,
              onDone: '#idle',
              onError: catchError,
            },
          },
          discarding: {
            invoke: {
              src: discardBatch,
              onDone: '#idle',
              onError: catchError,
            },
          },
        },
      },

      error: {
        id: 'error',
        initial: 'error',
        states: {
          error: {
            on: {
              DISCARD_BATCH: 'discarding',
            },
          },
          discarding: {
            invoke: {
              src: discardBatch,
              onDone: '#idle',
              onError: { target: 'error', actions: assignError },
            },
          },
        },
      },
    },
  });
}

function isEventUserAction(event: EventObject): boolean {
  return [
    'START_BATCH',
    'PAUSE_BATCH',
    'RESUME_BATCH',
    'SAVE_BATCH',
    'DISCARD_BATCH',
    'ACCEPT_SHEET',
    'REJECT_SHEET',
  ].includes(event.type);
}

export function cleanLogData(key: string, value: unknown): unknown {
  if (value === undefined) {
    return 'undefined';
  }
  if (value instanceof Error) {
    return { ...value, message: value.message, stack: value.stack };
  }
  // Protect voter privacy
  if (key === 'reasons') {
    return (value as AdjudicationReasonInfo[]).map((reason) => reason.type);
  }
  // Hide large values
  if (key === 'control') {
    return '[hidden]';
  }
  return value;
}

function setupLogging(
  machineService: InterpreterFrom<typeof buildMachine>,
  logger: Logger
) {
  machineService
    .onEvent(async (event) => {
      const eventString = JSON.stringify(event, cleanLogData);
      if (isEventUserAction(event)) {
        await logger.logAsCurrentRole(
          LogEventId.ScannerEvent,
          { message: `Event: ${event.type}`, eventObject: eventString },
          // @coverage-exclude
          () => debug(`Event: ${eventString}`)
        );
      } else {
        logger.log(
          LogEventId.ScannerEvent,
          'system',
          { message: `Event: ${event.type}`, eventObject: eventString },
          () => debug(`Event: ${eventString}`)
        );
      }
    })
    .onChange((context, previousContext) => {
      // @coverage-exclude
      if (!previousContext) return;
      const changed = Object.entries(context).filter(
        ([key, value]) => previousContext[key as keyof Context] !== value
      );
      if (changed.length === 0) return;
      const contextString = JSON.stringify(
        Object.fromEntries(changed),
        cleanLogData
      );
      logger.log(
        LogEventId.ScannerStateChanged,
        'system',
        {
          message: `Context updated`,
          changedFields: contextString,
        },
        () => debug(`Context updated: ${contextString}`)
      );
    })
    .onTransition((state) => {
      logger.log(
        LogEventId.ScannerStateChanged,
        'system',
        {
          message: `Transitioned to: ${JSON.stringify(state.value)}`,
          newState: JSON.stringify(state.value),
        },
        (logLine: LogLine) => debug(logLine.message)
      );
    });
}

/**
 * Creates the state machine for the batch scanner.
 *
 * The machine tracks the state of the app as it drives the scanner, scanning
 * and interpreting ballots in batches, using the batch scanner API as the
 * source of truth for the state of the scanner itself.
 *
 * The machine transitions between states in response to commands as well as in
 * response to events from the scanner.
 *
 * It's implemented using XState (https://xstate.js.org/docs/).
 */
export function createBatchScannerStateMachine({
  scanner,
  workspace,
  logger,
}: {
  scanner: BatchScanner;
  workspace: Workspace;
  logger: Logger;
}): BatchScannerStateMachine {
  const machineService = interpret(
    buildMachine({ scanner, workspace, logger })
  ).start();
  setupLogging(machineService, logger);

  return {
    status(): BatchScannerMachineStatus {
      const { state } = machineService;
      const { batchId, pauseReason } = state.context;
      // We use state.matches as recommended by the XState docs. This allows
      // us to add new substates to a state without breaking these checks.
      if (state.matches('idle')) {
        return { state: 'idle' };
      }
      if (
        ['startingBatch', 'scanningSheet', 'interpretingSheet'].some(
          (scanningState) => state.matches(scanningState)
        )
      ) {
        return { state: 'scanning', batchId: assertDefined(batchId) };
      }
      if (state.matches('sheetNeedsReview')) {
        assert(pauseReason?.type === 'review');
        return {
          state: 'needsReview',
          batchId: assertDefined(batchId),
          sheetId: pauseReason.sheetId,
        };
      }
      if (state.matches('paused')) {
        return {
          state: 'paused',
          batchId: assertDefined(batchId),
          pauseReason: assertDefined(pauseReason),
        };
      }
      if (state.matches('error')) {
        return { state: 'error', batchId: assertDefined(batchId) };
      }
      // @coverage-exclude
      throw new Error(`Unexpected state: ${JSON.stringify(state.value)}`);
    },

    async startBatch() {
      machineService.send('START_BATCH');
      await waitFor(machineService, (state) => !state.matches('startingBatch'));
    },

    async pauseBatch() {
      machineService.send('PAUSE_BATCH');
      await waitFor(
        machineService,
        (state) =>
          !(
            state.matches('startingBatch') ||
            state.matches('scanningSheet') ||
            state.matches('interpretingSheet')
          )
      );
    },

    async resumeBatch() {
      machineService.send('RESUME_BATCH');
      await waitFor(
        machineService,
        (state) => !state.matches('paused.resuming')
      );
    },

    async saveBatch() {
      machineService.send('SAVE_BATCH');
      await waitFor(machineService, (state) => !state.matches('paused.saving'));
    },

    async discardBatch() {
      machineService.send('DISCARD_BATCH');
      await waitFor(
        machineService,
        (state) =>
          !(
            state.matches('paused.discarding') ||
            state.matches('error.discarding')
          )
      );
    },

    async acceptSheet() {
      machineService.send('ACCEPT_SHEET');
      await waitFor(
        machineService,
        (state) => !state.matches('sheetNeedsReview')
      );
    },

    async rejectSheet() {
      machineService.send('REJECT_SHEET');
      await waitFor(
        machineService,
        (state) => !state.matches('sheetNeedsReview')
      );
    },

    stop() {
      machineService.stop();
    },
  };
}
