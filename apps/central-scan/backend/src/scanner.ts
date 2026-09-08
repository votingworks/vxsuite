import {
  assert,
  assertDefined,
  extractErrorMessage,
} from '@votingworks/basics';
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
  EventObject,
  interpret,
  Interpreter,
  sendParent,
} from 'xstate';
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
import { BatchScannerMachineStatus } from './types.js';

const debug = makeDebug('scan:state-machine');

interface BatchContext {
  control: BatchControl;
  imageDirectory: string;
}

interface Context {
  batchId?: Id;
  batchContext?: BatchContext;
  scannedSheet?: ScannedSheetInfo;
  sheetIdToReview?: Id;
  error?: Error;
}

type Event =
  | { type: 'START_BATCH' }
  | { type: 'ACCEPT_SHEET' }
  | { type: 'REJECT_SHEET' }
  | { type: 'SCANNER_CONNECTED' }
  | { type: 'SCANNER_DISCONNECTED' };

interface Delays {
  DELAY_SCANNER_CONNECTION_POLLING_INTERVAL: number;
}

export const delays = {
  DELAY_SCANNER_CONNECTION_POLLING_INTERVAL: 500,
} satisfies Delays;

export interface BatchScannerStateMachine {
  status(): BatchScannerMachineStatus;

  // The commands are non-blocking and do not return a result. They just send
  // an event to the machine. The effects of the event (or any error) will show
  // up in the status.
  startBatch(): void;
  acceptSheet(): void;
  rejectSheet(): void;

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

  function createPollingChildMachine(
    id: string,
    queryFn: () => Promise<Event>,
    delay: keyof Delays
  ) {
    return createMachine(
      {
        id,
        strict: true,
        predictableActionArguments: true,

        initial: 'querying',
        states: {
          querying: {
            invoke: {
              src: queryFn,
              onDone: {
                target: 'waiting',
                actions: sendParent((_, event) => event.data),
              },
            },
          },
          waiting: {
            after: { [delay]: 'querying' },
          },
        },
      },
      { delays }
    );
  }

  const pollScannerConnection = createPollingChildMachine(
    'pollScannerConnection',
    // eslint-disable-next-line @typescript-eslint/require-await
    async () => ({
      type: scanner.isAttached() ? 'SCANNER_CONNECTED' : 'SCANNER_DISCONNECTED',
    }),
    'DELAY_SCANNER_CONNECTION_POLLING_INTERVAL'
  );

  async function startScanningBatch(batchId: string): Promise<BatchContext> {
    const imageDirectory = join(workspace.ballotImagesPath, `batch-${batchId}`);
    try {
      const hasImprinter = await scanner.isImprinterAttached();
      logger.log(LogEventId.ImprinterStatus, 'system', {
        // @coverage-defer
        message: `Imprinter is ${hasImprinter ? 'attached' : 'not attached'}.`,
      });
      await fsExtra.ensureDir(imageDirectory);
      debug('scanning starting for batch %s into %s', batchId, imageDirectory);
      const control = scanner.scanSheets({
        directory: imageDirectory,
        pageSize: store.getBallotPaperSizeForElection(),
        // @coverage-defer
        // If the imprinter is attached, imprint an ID prefixed by the batch ID
        imprintIdPrefix: hasImprinter ? batchId : undefined,
      });
      void logger.logAsCurrentRole(LogEventId.ScannerBatchStarted, {
        disposition: 'success',
        message: `User has begun scanning a new batch with ID: ${batchId}`,
        batchId,
      });
      return { control, imageDirectory };
    } catch (error) {
      store.deleteBatch(batchId);
      await fsExtra.remove(imageDirectory);
      void logger.logAsCurrentRole(LogEventId.ScannerBatchStarted, {
        disposition: 'failure',
        message: `User attempt to start scanning failed: ${extractErrorMessage(
          error
        )}`,
        batchId,
      });
      throw error;
    }
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
      pages = mapSheet(
        pages,
        ({ imagePath }): PageInterpretationWithFiles => ({
          imagePath,
          interpretation: {
            type: 'UnreadablePage',
            reason: `invalid CVR: ${errDescription}`,
          },
        })
      );
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
    store.addSheet(election, sheetId, batchId, pages, sheet.ballotAuditId);

    const interpretations = mapSheet(
      pages,
      ({ interpretation }) => interpretation
    );

    debug(
      'imported sheet %o for batch %s in %dms',
      sheet,
      batchId,
      Date.now() - start
    );
    return {
      sheetId,
      interpretation: combinePageInterpretationsForSheet(
        interpretations,
        election
      ),
    };
  }

  async function finishBatch({
    batchId,
    batchContext,
    error,
  }: Context): Promise<void> {
    assert(batchId !== undefined);
    const { control, imageDirectory } = assertDefined(batchContext);
    debug('finishing batch %s', batchId);

    store.finishBatch({ batchId, error: error?.message });
    await control.endBatch();
    await fsExtra.remove(imageDirectory);
    if (error) {
      await logger.logAsCurrentRole(LogEventId.ScannerBatchEnded, {
        disposition: 'failure',
        message: `Processing sheet failed: ${error.message}`,
        batchId,
      });
    } else {
      const batch = store.getBatch(batchId);
      await logger.logAsCurrentRole(LogEventId.ScannerBatchEnded, {
        disposition: 'success',
        message: `Scanning batch ${batch.id} successfully completed scanning ${batch.count} sheets.`,
        batchId: batch.id,
        sheetCount: batch.count,
        scanningEndedAt: batch.endedAt,
      });
    }
  }

  const clearBatch = assign<Context, Event>({
    batchId: undefined,
    batchContext: undefined,
    scannedSheet: undefined,
    sheetIdToReview: undefined,
  });

  return createMachine<Context, Event>({
    id: 'batch_scanner',
    strict: true,
    predictableActionArguments: true,

    context: {},

    initial: 'disconnected',
    states: {
      disconnected: {
        invoke: pollScannerConnection,
        on: { SCANNER_CONNECTED: 'idle' },
      },

      idle: {
        entry: clearBatch,
        invoke: pollScannerConnection,
        on: {
          START_BATCH: {
            target: 'startingBatch',
            actions: assign(
              (): Partial<Context> => ({
                batchId: store.addBatch(),
                error: undefined,
              })
            ),
          },
          SCANNER_DISCONNECTED: 'disconnected',
        },
      },

      startingBatch: {
        invoke: {
          src: (context) => startScanningBatch(assertDefined(context.batchId)),
          onDone: {
            target: 'scanningSheet',
            actions: assign({
              batchContext: (_context, event) => event.data,
            }),
          },
          onError: {
            target: 'idle',
            actions: assign({ error: (_context, event) => event.data }),
          },
        },
      },

      scanningSheet: {
        entry: assign({
          scannedSheet: undefined,
          sheetIdToReview: undefined,
        }),
        invoke: {
          src: (context) =>
            assertDefined(context.batchContext).control.scanSheet(),
          onDone: [
            {
              cond: (_context, event) => event.data !== undefined,
              target: 'interpretingSheet',
              actions: assign({
                scannedSheet: (_context, event) => event.data,
              }),
            },
            { target: 'finishingBatch' },
          ],
          onError: {
            target: 'finishingBatch',
            actions: assign({ error: (_context, event) => event.data }),
          },
        },
      },

      interpretingSheet: {
        invoke: {
          src: (context) =>
            interpretAndSaveSheet(
              assertDefined(context.batchId),
              assertDefined(context.scannedSheet)
            ),
          onDone: [
            {
              cond: (_context, event) =>
                event.data.interpretation.type === 'ValidSheet',
              target: 'scanningSheet',
            },
            {
              target: 'sheetNeedsReview',
              actions: assign({
                sheetIdToReview: (_context, event) => event.data.sheetId,
              }),
            },
          ],
          onError: {
            target: 'finishingBatch',
            actions: assign({ error: (_context, event) => event.data }),
          },
        },
      },

      sheetNeedsReview: {
        on: {
          ACCEPT_SHEET: {
            target: 'scanningSheet',
            actions: (context) =>
              store.adjudicateSheet(assertDefined(context.sheetIdToReview)),
          },
          REJECT_SHEET: {
            target: 'scanningSheet',
            actions: (context) =>
              store.deleteSheet(assertDefined(context.sheetIdToReview)),
          },
        },
      },

      finishingBatch: {
        invoke: {
          src: finishBatch,
          onDone: 'idle',
          onError: {
            target: 'idle',
            actions: assign({ error: (_context, event) => event.data }),
          },
        },
      },
    },
  });
}

function isEventUserAction(event: EventObject): boolean {
  return ['START_BATCH', 'ACCEPT_SHEET', 'REJECT_SHEET'].includes(event.type);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  machineService: Interpreter<Context, any, Event, any, any>,
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
      if (!state.changed) return;
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
      const { batchId, error } = state.context;
      // We use state.matches as recommended by the XState docs. This allows
      // us to add new substates to a state without breaking these checks.
      if (state.matches('disconnected')) {
        return { state: 'disconnected' };
      }
      if (state.matches('idle')) {
        return { state: 'idle', error: error?.message };
      }
      if (
        [
          'startingBatch',
          'scanningSheet',
          'interpretingSheet',
          'finishingBatch',
        ].some((scanningState) => state.matches(scanningState))
      ) {
        return { state: 'scanning', batchId: assertDefined(batchId) };
      }
      if (state.matches('sheetNeedsReview')) {
        return { state: 'needsReview', batchId: assertDefined(batchId) };
      }
      // @coverage-exclude
      throw new Error(`Unexpected state: ${JSON.stringify(state.value)}`);
    },

    startBatch() {
      machineService.send('START_BATCH');
    },

    acceptSheet() {
      machineService.send('ACCEPT_SHEET');
    },

    rejectSheet() {
      machineService.send('REJECT_SHEET');
    },

    stop() {
      machineService.stop();
    },
  };
}
