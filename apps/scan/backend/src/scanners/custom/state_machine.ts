import { assert, Result, throwIllegalValue } from '@votingworks/basics';
import {
  CustomScanner,
  DoubleSheetDetectOpt,
  ErrorCode,
  FormMovement,
  FormStanding,
  ImageColorDepthType,
  ImageFromScanner,
  ImageResolution,
  openScanner,
  ScannerStatus,
  ScanSide,
  SensorStatus,
} from '@votingworks/custom-scanner';
import { toRgba, writeImageData } from '@votingworks/image-utils';
import { LogEventId, Logger, LogLine } from '@votingworks/logging';
import { Id, mapSheet, SheetInterpretation, SheetOf } from '@votingworks/types';
import { createImageData } from 'canvas';
import { join } from 'path';
import { switchMap, throwError, timeout, timer } from 'rxjs';
import { v4 as uuid } from 'uuid';
import {
  assign as xassign,
  Assigner,
  BaseActionObject,
  createMachine,
  interpret as interpretStateMachine,
  Interpreter,
  InvokeConfig,
  PropertyAssigner,
  StateNodeConfig,
  TransitionConfig,
} from 'xstate';
import { SheetInterpretationWithPages } from '@votingworks/ballot-interpreter';
import { interpret as defaultInterpret, InterpretFn } from '../../interpret';
import { Store } from '../../store';
import {
  PrecinctScannerErrorType,
  PrecinctScannerMachineStatus,
  PrecinctScannerStateMachine,
} from '../../types';
import { rootDebug } from '../../util/debug';
import { Workspace } from '../../util/workspace';

const debug = rootDebug.extend('state-machine');
const debugPaperStatus = debug.extend('paper-status');
const debugEvents = debug.extend('events');

export const MAX_FAILED_SCAN_ATTEMPTS = 1;

async function defaultCreateCustomClient(): Promise<
  Result<CustomScanner, ErrorCode>
> {
  return await openScanner();
}

export type CreateCustomClient = typeof defaultCreateCustomClient;

class PrecinctScannerError extends Error {
  // eslint-disable-next-line vx/gts-no-public-class-fields
  constructor(public type: PrecinctScannerErrorType, message?: string) {
    super(message ?? type);
  }
}

type InterpretationResult = SheetInterpretationWithPages & { sheetId: Id };

interface Context {
  client?: CustomScanner;
  workspace: Workspace;
  scannedSheet?: SheetOf<string>;
  interpretation?: InterpretationResult;
  error?: Error | ErrorCode;
  failedScanAttempts?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assign(arg: Assigner<Context, any> | PropertyAssigner<Context, any>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return xassign<Context, any>(arg);
}

type ScannerStatusEvent =
  | { type: 'SCANNER_NO_PAPER' }
  | { type: 'SCANNER_READY_TO_SCAN' }
  | { type: 'SCANNER_READY_TO_EJECT' }
  | { type: 'SCANNER_BOTH_SIDES_HAVE_PAPER' }
  | { type: 'SCANNER_JAM' }
  | { type: 'SCANNER_JAM_CLEARED' }
  | { type: 'SCANNER_JAM_DOUBLE_SHEET' }
  | { type: 'SCANNER_DISCONNECTED' };

type CommandEvent = { type: 'SCAN' } | { type: 'ACCEPT' } | { type: 'RETURN' };

export type Event = ScannerStatusEvent | CommandEvent;

export interface Delays {
  DELAY_PAPER_STATUS_POLLING_INTERVAL: number;
  DELAY_PAPER_STATUS_POLLING_TIMEOUT: number;
  DELAY_SCANNING_TIMEOUT: number;
  DELAY_ACCEPTING_TIMEOUT: number;
  DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT: number;
  DELAY_ACCEPTED_RESET_TO_NO_PAPER: number;
  DELAY_WAIT_FOR_HOLD_AFTER_REJECT: number;
  DELAY_RECONNECT: number;
  DELAY_RECONNECT_ON_UNEXPECTED_ERROR: number;
  DELAY_WAIT_FOR_JAM_CLEARED: number;
  DELAY_JAM_WHEN_SCANNING: number;
}

const defaultDelays: Delays = {
  // Time between calls to get paper status from the scanner.
  DELAY_PAPER_STATUS_POLLING_INTERVAL: 500,
  // How long to wait for a single paper status call to return before giving up.
  DELAY_PAPER_STATUS_POLLING_TIMEOUT: 2_000,
  // How long to attempt scanning before giving up and disconnecting and
  // reconnecting to the scanner.
  DELAY_SCANNING_TIMEOUT: 5_000,
  // How long to attempt accepting before giving up and rejecting the ballot.
  DELAY_ACCEPTING_TIMEOUT: 5_000,
  // When in accepted state, how long to ignore any new ballot that is
  // inserted (this ensures the user sees the accepted screen for a bit
  // before starting a new scan).
  DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT: 2_000,
  // How long to wait on the accepted state before automatically going
  // back to no_paper.
  DELAY_ACCEPTED_RESET_TO_NO_PAPER: 5_000,
  // How long to wait for the scanner to grab the paper and return paper status
  // READY_TO_SCAN once it starts moving the ballot backward. Needs to be
  // greater than PAPER_STATUS_POLLING_INTERVAL otherwise we'll never have a
  // chance to see the READY_TO_SCAN status. Experimentally, 2000ms seems to be
  // a good amount.  Don't change this delay lightly since it impacts the actual
  // logic of the scanner.
  DELAY_WAIT_FOR_HOLD_AFTER_REJECT: 2_000,
  // When disconnected, how long to wait before trying to reconnect.
  DELAY_RECONNECT: 500,
  // When we run into an unexpected error (e.g. unexpected paper status), how
  // long to wait before trying to reconnect. This should be pretty long in
  // order to let the scanner to finish whatever it's doing (yes, even after
  // disconnecting, the scanner might keep scanning).
  DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 3_000,
  // When we decide we're jammed, how long to wait before we transition to
  // `internal_jam`.
  DELAY_WAIT_FOR_JAM_CLEARED: 500,
  // When scanning fails with a jam error the jam state may take a moment to stablize,
  // delay before deciding what type of jam to proceed with.
  DELAY_JAM_WHEN_SCANNING: 500,
};

function connectToCustom(createCustomClient: CreateCustomClient) {
  return async (): Promise<CustomScanner> => {
    debug('Connecting to Custom scanner');
    const customClient = await createCustomClient();
    debug('Custom scanner client connected: %s', customClient.isOk());
    return customClient.unsafeUnwrap();
  };
}

async function closeCustomClient({ client }: Context) {
  if (!client) return;
  debug('Closing Custom scanner client');
  await client.disconnect();
  debug('Custom scanner client closed');
}

function scannerStatusToEvent(
  scannerStatus: ScannerStatus
): ScannerStatusEvent {
  const frontHasPaper =
    scannerStatus.sensorInputLeftLeft === SensorStatus.PaperPresent &&
    scannerStatus.sensorInputCenterLeft === SensorStatus.PaperPresent &&
    scannerStatus.sensorInputCenterRight === SensorStatus.PaperPresent &&
    scannerStatus.sensorInputRightRight === SensorStatus.PaperPresent;
  const backHasPaper =
    scannerStatus.sensorOutputLeftLeft === SensorStatus.PaperPresent &&
    scannerStatus.sensorOutputCenterLeft === SensorStatus.PaperPresent &&
    scannerStatus.sensorOutputCenterRight === SensorStatus.PaperPresent &&
    scannerStatus.sensorOutputRightRight === SensorStatus.PaperPresent;

  if (scannerStatus.isScannerCoverOpen) {
    return { type: 'SCANNER_DISCONNECTED' };
  }

  if (scannerStatus.isPaperJam || scannerStatus.isJamPaperHeldBack) {
    if (!frontHasPaper && !backHasPaper) {
      return { type: 'SCANNER_JAM_CLEARED' };
    }

    if (scannerStatus.isDoubleSheet) {
      return { type: 'SCANNER_JAM_DOUBLE_SHEET' };
    }
    return { type: 'SCANNER_JAM' };
  }

  if (!frontHasPaper && !backHasPaper) {
    return { type: 'SCANNER_NO_PAPER' };
  }

  if (frontHasPaper && !backHasPaper) {
    return { type: 'SCANNER_READY_TO_SCAN' };
  }

  if (!frontHasPaper && backHasPaper) {
    return { type: 'SCANNER_READY_TO_EJECT' };
  }

  // If we get here frontHasPaper and backHasPaper are true
  return { type: 'SCANNER_BOTH_SIDES_HAVE_PAPER' };
}

function scannerStatusErrorToEvent(error: ErrorCode): ScannerStatusEvent {
  switch (error) {
    case ErrorCode.PaperJam:
    case ErrorCode.PaperHeldBack:
      return { type: 'SCANNER_JAM' };

    case ErrorCode.DeviceAnswerUnknown:
    case ErrorCode.NoDeviceAnswer:
    case ErrorCode.ScannerOffline:
      return { type: 'SCANNER_DISCONNECTED' };

    default:
      throw new PrecinctScannerError(
        'unexpected_paper_status',
        `Unexpected paper status error: ${ErrorCode[error]} (${error})`
      );
  }
}

/**
 * Create an observable that polls the paper status and emits state machine
 * events. Some known errors are converted into events, allowing polling to
 * continue. Unexpected errors will end polling.
 */
function buildPaperStatusObserver(
  pollingInterval: number,
  pollingTimeout: number
) {
  return ({ client }: Context) => {
    assert(client);
    return timer(0, pollingInterval).pipe(
      switchMap(async () => {
        const status = await client.getStatus();
        debugPaperStatus('Paper status: %o', status);
        const mapped = status.isOk()
          ? scannerStatusToEvent(status.ok())
          : scannerStatusErrorToEvent(status.err());
        debugPaperStatus('Mapped paper status: %o', mapped);
        return mapped;
      }),
      timeout({
        each: pollingTimeout,
        with: () =>
          throwError(() => new PrecinctScannerError('paper_status_timed_out')),
      })
    );
  };
}

async function reset({ client }: Context): Promise<void> {
  assert(client);
  debug('Resetting hardware');
  const result = await client.resetHardware();
  result.unsafeUnwrap();
}

async function scan({ client, workspace }: Context): Promise<SheetOf<string>> {
  assert(client);
  debug('Scanning');
  const isUltrasonicDisabled = workspace.store.getIsUltrasonicDisabled();
  const scanResult = await client.scan({
    wantedScanSide: ScanSide.A_AND_B,
    resolution: ImageResolution.RESOLUTION_200_DPI,
    imageColorDepth: ImageColorDepthType.Grey8bpp,
    formStandingAfterScan: FormStanding.HOLD_TICKET,
    doubleSheetDetection: isUltrasonicDisabled
      ? DoubleSheetDetectOpt.DetectOff
      : DoubleSheetDetectOpt.Level1,
  });
  debug('Scan result: %o', scanResult);
  const images = scanResult.unsafeUnwrap();

  /**
   *
   */
  function trimBlackFromTopAndBottomOfImage(
    image: ImageFromScanner
  ): ImageFromScanner {
    const { imageBuffer, imageWidth, imageHeight } = image;
    const channelCount = imageBuffer.length / (imageWidth * imageHeight);

    let indexOfFirstNonBlackValue = 0;

    for (let i = 0; i < imageBuffer.length; i += 1) {
      if (imageBuffer[i] !== 0) {
        indexOfFirstNonBlackValue = i;
        break;
      }
    }

    let indexOfLastNonBlackValue = imageBuffer.length - 1;

    for (let i = imageBuffer.length - 1; i >= 0; i -= 1) {
      if (imageBuffer[i] !== 0) {
        indexOfLastNonBlackValue = i;
        break;
      }
    }

    const offsetPerRow = imageWidth * channelCount;
    const indexOfFirstNonBlackRow = Math.floor(
      indexOfFirstNonBlackValue / offsetPerRow
    );
    const indexOfLastNonBlackRow = Math.floor(
      indexOfLastNonBlackValue / offsetPerRow
    );
    debug(
      'Trimming black from top and bottom of image (keeping y=%d..%d)',
      indexOfFirstNonBlackRow,
      indexOfLastNonBlackRow
    );

    const trimmed: ImageFromScanner = {
      ...image,
      imageBuffer: imageBuffer.slice(
        indexOfFirstNonBlackRow * offsetPerRow,
        (indexOfLastNonBlackRow + 1) * offsetPerRow
      ),
      imageHeight: image.imageBuffer.length / offsetPerRow,
    };
    debug('Trimmed image: %O', trimmed);
    return trimmed;
  }

  // FIXME: we should be able to use the image format directly, but the
  // rest of the system expects file paths instead of image buffers.
  const sheetPrefix = uuid();
  return await mapSheet(images, async (image, side) => {
    const trimmedImage = trimBlackFromTopAndBottomOfImage(image);

    const { scannedImagesPath } = workspace;
    const path = join(scannedImagesPath, `${sheetPrefix}-${side}.jpeg`);
    const imageData = toRgba(
      createImageData(
        Uint8ClampedArray.from(trimmedImage.imageBuffer),
        trimmedImage.imageWidth,
        trimmedImage.imageHeight
      )
    ).assertOk('convert to RGBA');
    await writeImageData(path, imageData);
    return path;
  });
}

async function interpretSheet(
  interpret: InterpretFn,
  { scannedSheet, workspace }: Context
): Promise<InterpretationResult> {
  assert(scannedSheet);
  const sheetId = uuid();
  const { store } = workspace;
  const electionDefinition = store.getElectionDefinition();
  const precinctSelection = store.getPrecinctSelection();
  assert(electionDefinition);
  assert(precinctSelection);
  const interpretation = (
    await interpret(sheetId, scannedSheet, {
      electionDefinition,
      precinctSelection,
      testMode: store.getTestMode(),
      ballotImagesPath: workspace.ballotImagesPath,
    })
  ).unsafeUnwrap();
  return {
    ...interpretation,
    sheetId,
  };
}

async function accept({ client }: Context) {
  assert(client);
  debug('Accepting');
  const acceptResult = await client.move(FormMovement.EJECT_PAPER_FORWARD);
  debug('Accept result: %o', acceptResult);
  return acceptResult.unsafeUnwrap();
}

async function stopAccept({ client }: Context) {
  assert(client);
  debug('Stopping Accept');
  const stopResult = await client.move(FormMovement.LOAD_PAPER);
  debug('Stop Accept result: %o', stopResult);
  return stopResult.unsafeUnwrap();
}

async function reject({ client }: Context) {
  assert(client);
  debug('Rejecting');
  const rejectResult = await client.move(FormMovement.RETRACT_PAPER_BACKWARD);
  debug('Reject result: %o', rejectResult);
  return rejectResult.unsafeUnwrap();
}

function storeInterpretedSheet(
  store: Store,
  sheetId: Id,
  interpretation: SheetInterpretationWithPages
): Id {
  const ongoingBatchId = store.getOngoingBatchId();
  assert(typeof ongoingBatchId === 'string');
  const addedSheetId = store.addSheet(
    sheetId,
    ongoingBatchId,
    interpretation.pages
  );
  return addedSheetId;
}

function recordAcceptedSheet(store: Store, { interpretation }: Context) {
  assert(store);
  assert(interpretation);
  const { sheetId } = interpretation;
  storeInterpretedSheet(store, sheetId, interpretation);
  // If we're storing an accepted sheet that needed review that means it was
  // "adjudicated" (i.e. the voter said to count it without changing anything)
  if (interpretation.type === 'NeedsReviewSheet') {
    store.adjudicateSheet(sheetId);
  }
  debug('Stored accepted sheet: %s', sheetId);
}

function recordRejectedSheet(store: Store, { interpretation }: Context) {
  assert(store);
  if (!interpretation) return;
  const { sheetId } = interpretation;
  storeInterpretedSheet(store, sheetId, interpretation);
  // We want to keep rejected ballots in the store so we know what happened, but
  // not count them. The way to do that is to "delete" them, which just marks
  // them as deleted and currently is the way to indicate an interpreted ballot
  // was not counted.
  store.deleteSheet(sheetId);
  debug('Stored rejected sheet: %s', sheetId);
}

const clearLastScan = assign({
  scannedSheet: undefined,
  interpretation: undefined,
});

const clearError = assign({
  error: undefined,
});

const doNothing: TransitionConfig<Context, Event> = { target: undefined };

function buildMachine({
  createCustomClient = defaultCreateCustomClient,
  workspace,
  interpret,
  delayOverrides,
}: {
  createCustomClient?: CreateCustomClient;
  workspace: Workspace;
  interpret: InterpretFn;
  delayOverrides: Partial<Delays>;
}) {
  const delays: Delays = { ...defaultDelays, ...delayOverrides };

  const pollPaperStatus: InvokeConfig<Context, Event> = {
    src: buildPaperStatusObserver(
      delays.DELAY_PAPER_STATUS_POLLING_INTERVAL,
      delays.DELAY_PAPER_STATUS_POLLING_TIMEOUT
    ),
    onError: {
      target: '#error',
      actions: assign({ error: (_, event) => event.data }),
    },
  };

  const acceptingState: StateNodeConfig<
    Context,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    Event,
    BaseActionObject
  > = {
    initial: 'starting',
    entry: assign({ failedScanAttempts: 0 }),
    states: {
      starting: {
        invoke: {
          src: accept,
          // Calling `accept` tells the Custom scanner to eject the ballot
          // forward but does not wait for it to actually happen. We need to
          // wait for the scanner to tell us that the ballot has been ejected
          // before we can move on.
          onDone: 'checking_completed',
          onError: '#error',
        },
      },
      checking_completed: {
        invoke: pollPaperStatus,
        on: {
          SCANNER_NO_PAPER: '#accepted',
          // If there's a paper in front, that means the ballot in back did get
          // dropped but somebody quickly inserted a new ballot in front, so we
          // should count the first ballot as accepted.
          SCANNER_READY_TO_SCAN: 'stop_accept',
          // Sometimes the accept command will complete successfully even though
          // the ballot hasn't been dropped yet (e.g. if it's stuck), so we wait
          // a bit to see if it gets dropped.
          SCANNER_READY_TO_EJECT: doNothing,
          // Sometimes the accept command will complete successfully even though
          // the ballot hasn't been dropped yet (e.g. if it's stuck), so we wait
          // a bit to see if it gets dropped.
          SCANNER_BOTH_SIDES_HAVE_PAPER: 'stop_accept',
        },
        // If the paper eventually didn't get dropped, reject it.
        after: {
          DELAY_ACCEPTING_TIMEOUT: {
            target: '#rejecting',
            actions: assign({
              error: new PrecinctScannerError('paper_in_back_after_accept'),
            }),
          },
        },
      },
      // This occurs when paper is seen while the ballot is being accepted.
      stop_accept: {
        invoke: {
          // Stop the accept action by triggering the load paper command.
          src: stopAccept,
          // The first ballot will get deposited as the second ballot is loaded slightly from the load paper command.
          // Mark the first ballot as accepted and then the state of where the second ballot is will be appropriately handled.
          onDone: '#accepted',
          onError: '#error',
        },
      },
    },
  };

  function jamClearedState(): StateNodeConfig<
    Context,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    Event,
    BaseActionObject
  > {
    return {
      entry: [clearError, clearLastScan],
      initial: 'resetting',
      states: {
        resetting: {
          invoke: {
            src: reset,
            onDone: {
              target: 'disconnect_after_reset',
            },
            onError: {
              target: 'disconnect_after_reset',
            },
          },
        },
        disconnect_after_reset: {
          initial: 'waiting_to_retry_connecting',
          states: {
            waiting_to_retry_connecting: {
              after: { DELAY_RECONNECT: 'reconnecting' },
            },
            reconnecting: {
              invoke: {
                src: connectToCustom(createCustomClient),
                onDone: {
                  target: '#checking_initial_paper_status',
                  actions: assign({
                    client: (_context, event) => event.data,
                    error: undefined,
                  }),
                },
                onError: 'waiting_to_retry_connecting',
              },
            },
          },
        },
      },
    };
  }

  function rejectingState(onDoneState: string): StateNodeConfig<
    Context,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    Event,
    BaseActionObject
  > {
    return {
      initial: 'starting',
      states: {
        starting: {
          entry: (context) => recordRejectedSheet(workspace.store, context),
          invoke: {
            src: reject,
            // Calling `reject` tells the Custom scanner to eject the ballot
            // backward but does not wait for it to actually happen. We need to
            // wait for the scanner to tell us that the ballot has been ejected
            // before we can move on.
            onDone: 'checking_completed',
            onError: '#error',
          },
        },
        checking_completed: {
          invoke: pollPaperStatus,
          on: {
            // Our expected end state is that the ballot is returned to the
            // voter and held in front, i.e. "ready to scan".
            SCANNER_READY_TO_SCAN: onDoneState,

            // If the voter pulls the paper out before we get to the expected
            // end state, just jump straight to '#no_paper'.
            SCANNER_NO_PAPER: '#no_paper',

            // This happens immediately after `reject` is called since the
            // paper hasn't really moved yet.
            SCANNER_READY_TO_EJECT: doNothing,

            // As the ballot is being ejected, the scanner will report that it
            // has paper in front and back. This is an expected intermediate
            // state.
            SCANNER_BOTH_SIDES_HAVE_PAPER: doNothing,
          },
          after: { DELAY_WAIT_FOR_HOLD_AFTER_REJECT: '#jam' },
        },
      },
    };
  }

  return createMachine<Context, Event>(
    {
      id: 'precinct_scanner',
      initial: 'connecting',
      strict: true,
      context: { workspace },
      on: {
        SCANNER_DISCONNECTED: 'disconnected',
        SCANNER_BOTH_SIDES_HAVE_PAPER: 'both_sides_have_paper_while_scanning',
        SCANNER_JAM_DOUBLE_SHEET: 'double_sheet',
        SCANNER_JAM: 'internal_jam',
        SCANNER_JAM_CLEARED: 'jam_cleared',
        // On unhandled commands, do nothing. This guards against any race
        // conditions where the frontend has an outdated scanner status and tries to
        // send a command.
        SCAN: doNothing,
        ACCEPT: doNothing,
        RETURN: doNothing,
        // On events that are not handled by a specified transition (e.g. unhandled
        // paper status), return an error so we can figure out what happened
        '*': {
          target: 'error',
          actions: assign({
            error: (_context, event) => {
              console.log(_context);
              console.log(event);
              return new PrecinctScannerError(
                'unexpected_event',
                `Unexpected event: ${event.type}`
              );
            },
          }),
        },
      },
      states: {
        connecting: {
          invoke: {
            src: connectToCustom(createCustomClient),
            onDone: {
              target: 'checking_initial_paper_status',
              actions: assign((_context, event) => ({
                client: event.data,
              })),
            },
            onError: 'disconnected',
          },
        },
        disconnected: {
          id: 'disconnected',
          entry: clearLastScan,
          initial: 'waiting_to_retry_connecting',
          states: {
            waiting_to_retry_connecting: {
              after: { DELAY_RECONNECT: 'reconnecting' },
            },
            reconnecting: {
              invoke: {
                src: connectToCustom(createCustomClient),
                onDone: {
                  target: '#checking_initial_paper_status',
                  actions: assign({
                    client: (_context, event) => event.data,
                    error: undefined,
                  }),
                },
                onError: 'waiting_to_retry_connecting',
              },
            },
          },
        },
        checking_initial_paper_status: {
          id: 'checking_initial_paper_status',
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: 'no_paper',
            SCANNER_JAM_CLEARED: 'jam_cleared',
            SCANNER_BOTH_SIDES_HAVE_PAPER: {
              target: 'rejecting',
              actions: assign({
                error: new PrecinctScannerError(
                  'paper_in_both_sides_after_reconnect'
                ),
              }),
            },
            SCANNER_READY_TO_SCAN: {
              target: 'rejected',
              actions: assign({
                error: new PrecinctScannerError(
                  'paper_in_front_after_reconnect'
                ),
              }),
            },
            SCANNER_READY_TO_EJECT: {
              target: 'rejecting',
              actions: assign({
                error: new PrecinctScannerError(
                  'paper_in_back_after_reconnect'
                ),
              }),
            },
          },
        },
        checking_paper_status_after_scan: {
          entry: [clearLastScan, clearError],
          id: 'checking_paper_status_after_scan',
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: 'no_paper',
            SCANNER_BOTH_SIDES_HAVE_PAPER: {
              target: 'returning_to_rescan',
            },
            SCANNER_READY_TO_EJECT: {
              target: 'returning_to_rescan',
            },
            // We can automatically start scanning the next ballot
            SCANNER_READY_TO_SCAN: 'ready_to_scan',
          },
        },
        no_paper: {
          id: 'no_paper',
          entry: [clearError, clearLastScan],
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: doNothing,
            SCANNER_READY_TO_SCAN: 'ready_to_scan',
            SCANNER_BOTH_SIDES_HAVE_PAPER: 'jam',
          },
        },
        ready_to_scan: {
          id: 'ready_to_scan',
          entry: [clearError, clearLastScan],
          invoke: pollPaperStatus,
          on: {
            SCAN: 'scanning',
            SCANNER_NO_PAPER: 'no_paper',
            SCANNER_READY_TO_SCAN: doNothing,
          },
        },
        scanning: {
          initial: 'starting_scan',
          states: {
            starting_scan: {
              entry: [clearError, clearLastScan],
              invoke: {
                src: scan,
                onDone: {
                  target: 'checking_scanning_completed',
                  actions: assign((_context, event) => ({
                    scannedSheet: event.data,
                  })),
                },
                onError: [
                  // If we got an error that indicates the paper wasn't grabbed
                  // or fed through the scanner, retry.
                  {
                    cond: (_context, event) =>
                      event.data === ErrorCode.NoDocumentToBeScanned,
                    target: '#rejected',
                    actions: assign(() => ({
                      error: new PrecinctScannerError('scanning_failed'),
                    })),
                  },
                  {
                    cond: (_context, event) =>
                      event.data === ErrorCode.PaperJam,
                    target: 'handle_paper_jam',
                    actions: assign((_context, event) => ({
                      error: event.data,
                    })),
                  },
                  // Otherwise, treat it as an unexpected error
                  {
                    target: '#error',
                    actions: assign((_context, event) => ({
                      error: event.data,
                    })),
                  },
                ],
              },
              after: {
                DELAY_SCANNING_TIMEOUT: {
                  target: '#error',
                  actions: assign({
                    error: new PrecinctScannerError('scanning_timed_out'),
                  }),
                },
              },
            },
            checking_scanning_completed: {
              invoke: pollPaperStatus,
              on: {
                SCANNER_READY_TO_EJECT: '#interpreting',
              },
            },
            handle_paper_jam: {
              after: { DELAY_JAM_WHEN_SCANNING: 'route_paper_jam' },
            },
            route_paper_jam: {
              invoke: pollPaperStatus,
              on: {
                SCANNER_JAM: '#internal_jam',
                SCANNER_JAM_DOUBLE_SHEET: '#double_sheet',
              },
            },
          },
        },
        interpreting: {
          id: 'interpreting',
          initial: 'starting',
          states: {
            starting: {
              invoke: {
                src: (context) => interpretSheet(interpret, context),
                onDone: {
                  target: 'routing_result',
                  actions: assign({
                    interpretation: (_context, event) => event.data,
                  }),
                },
                onError: [
                  {
                    target: '#returning_to_rescan',
                    actions: assign((context, event) => ({
                      error: event.data,
                      failedScanAttempts: (context.failedScanAttempts || 0) + 1,
                    })),
                    cond: (context) => {
                      const shouldRetry =
                        (context.failedScanAttempts || 0) <
                        MAX_FAILED_SCAN_ATTEMPTS;
                      return shouldRetry;
                    },
                  },
                  {
                    target: '#rejecting',
                    actions: assign((_context, event) => ({
                      error: event.data,
                      failedScanAttempts: 0,
                    })),
                  },
                ],
              },
            },
            routing_result: {
              always: [
                {
                  target: '#ready_to_accept',
                  cond: (context) => {
                    assert(context.interpretation);
                    return context.interpretation.type === 'ValidSheet';
                  },
                },
                {
                  target: '#rejecting',
                  cond: (context) => {
                    assert(context.interpretation);
                    return context.interpretation.type === 'InvalidSheet';
                  },
                },
                {
                  target: '#needs_review',
                  cond: (context) => {
                    assert(context.interpretation);
                    return context.interpretation.type === 'NeedsReviewSheet';
                  },
                },
              ],
            },
          },
        },
        ready_to_accept: {
          id: 'ready_to_accept',
          invoke: pollPaperStatus,
          on: {
            ACCEPT: 'accepting',
            SCANNER_READY_TO_EJECT: doNothing,
          },
        },
        accepting: acceptingState,
        accepted: {
          id: 'accepted',
          entry: (context) => recordAcceptedSheet(workspace.store, context),
          invoke: pollPaperStatus,
          initial: 'scanning_paused',
          on: { SCANNER_NO_PAPER: doNothing },
          states: {
            scanning_paused: {
              on: {
                SCANNER_READY_TO_SCAN: doNothing,
                SCANNER_BOTH_SIDES_HAVE_PAPER: doNothing,
                SCANNER_JAM: doNothing,
                SCANNER_READY_TO_EJECT: doNothing,
              },
              after: {
                DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT:
                  '#checking_paper_status_after_scan',
              },
            },
          },
          after: {
            DELAY_ACCEPTED_RESET_TO_NO_PAPER:
              '#checking_paper_status_after_scan',
          },
        },
        needs_review: {
          id: 'needs_review',
          invoke: pollPaperStatus,
          on: {
            ACCEPT: 'accepting_after_review',
            RETURN: 'returning',
            SCANNER_READY_TO_EJECT: doNothing,
          },
        },
        accepting_after_review: acceptingState,
        returning_to_rescan: {
          id: 'returning_to_rescan',
          ...rejectingState('#no_paper'),
        },
        returning: { id: 'returning', ...rejectingState('#returned') },
        returned: {
          id: 'returned',
          invoke: pollPaperStatus,
          on: {
            SCANNER_READY_TO_SCAN: doNothing,
            SCANNER_NO_PAPER: 'no_paper',
          },
        },
        rejecting: {
          id: 'rejecting',
          ...rejectingState('#rejected'),
        },
        // Paper has been rejected and is held in the front, waiting for removal.
        rejected: {
          id: 'rejected',
          invoke: pollPaperStatus,
          on: {
            SCANNER_READY_TO_SCAN: doNothing,
            SCANNER_NO_PAPER: 'no_paper',
          },
        },
        // There is a jam that the custom scanner itself has notified us of. We have
        // to reset the hardware in order to clear the jam when done.
        internal_jam: {
          id: 'internal_jam',
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: 'no_paper',
            SCANNER_JAM: doNothing,
            SCANNER_JAM_DOUBLE_SHEET: 'double_sheet',
            SCANNER_JAM_CLEARED: 'jam_cleared',
            SCANNER_READY_TO_SCAN: doNothing,
            SCANNER_READY_TO_EJECT: doNothing,
          },
        },
        double_sheet: {
          id: 'double_sheet',
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: 'no_paper',
            SCANNER_JAM: doNothing,
            SCANNER_JAM_DOUBLE_SHEET: doNothing,
            SCANNER_JAM_CLEARED: 'double_sheet_jam_cleared',
            SCANNER_READY_TO_SCAN: doNothing,
            SCANNER_READY_TO_EJECT: doNothing,
          },
        },
        // When we get into a state that we want to treat like a jam
        // but the custom scanner is not giving the isPaperJam status.
        jam: {
          id: 'jam',
          entry: [clearError, clearLastScan],
          initial: 'reject_paper',
          states: {
            reject_paper: {
              invoke: {
                src: reject,
                onDone: {
                  target: 'checking_complete',
                },
                onError: '#error',
              },
            },
            checking_complete: {
              invoke: pollPaperStatus,
              on: {
                SCANNER_NO_PAPER: '#no_paper',
                SCANNER_BOTH_SIDES_HAVE_PAPER: doNothing,
                SCANNER_JAM: doNothing,
                SCANNER_READY_TO_SCAN: '#ready_to_scan',
              },
              after: {
                DELAY_WAIT_FOR_JAM_CLEARED: '#internal_jam',
              },
            },
          },
        },
        jam_cleared: {
          id: 'jam_cleared',
          ...jamClearedState(),
        },
        double_sheet_jam_cleared: {
          id: 'double_sheet_jam_cleared',
          ...jamClearedState(),
        },
        both_sides_have_paper_while_scanning: {
          entry: clearError,
          invoke: pollPaperStatus,
          on: {
            SCANNER_BOTH_SIDES_HAVE_PAPER: doNothing,
            // Sometimes we get a no_paper blip when removing the front paper quickly
            SCANNER_NO_PAPER: doNothing,
            // After the front paper is removed:
            SCANNER_READY_TO_EJECT: [
              // If we already interpreted the paper, go back to routing to the
              // resulting state for that interpretation
              {
                target: 'interpreting.routing_result',
                cond: (context) => context.interpretation !== undefined,
              },
              // Else, if we have scanned images, try to interpret them
              {
                target: 'interpreting.starting',
                cond: (context) => context.scannedSheet !== undefined,
              },
              // Otherwise, reject the back paper
              {
                target: 'rejecting',
                actions: assign({
                  error: new PrecinctScannerError('both_sides_have_paper'),
                }),
              },
            ],
          },
        },
        // If we see an unexpected error, try disconnecting from the scanner and
        // starting over.
        error: {
          id: 'error',
          initial: 'disconnecting',
          states: {
            // First, try disconnecting the "nice" way
            disconnecting: {
              invoke: {
                src: closeCustomClient,
                onDone: 'cooling_off',
                onError: 'unexpected_error',
              },
              after: {
                DELAY_RECONNECT_ON_UNEXPECTED_ERROR: '#disconnected',
              },
            },
            // Now that we've disconnected, wait a bit to give the scanner time
            // to finish up anything it might be doing
            cooling_off: {
              after: { DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 'reconnecting' },
            },
            // Finally, we're ready to try reconnecting
            reconnecting: {
              invoke: {
                src: connectToCustom(createCustomClient),
                onDone: {
                  target: '#checking_initial_paper_status',
                  actions: assign({
                    client: (_context, event) => event.data,
                    error: undefined,
                  }),
                },
                onError: 'unexpected_error',
              },
            },
            // When an unexpected error occurs the scanner has likely disconnected, reset to that state.
            unexpected_error: {
              after: {
                DELAY_RECONNECT_ON_UNEXPECTED_ERROR: '#disconnected',
              },
            },
          },
        },
      },
    },
    { delays: { ...delays } }
  );
}

function setupLogging(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  machineService: Interpreter<Context, any, Event, any, any>,
  logger: Logger
) {
  machineService
    .onEvent(async (event) => {
      // To protect voter privacy, we only log the event type (since some event
      // objects include ballot interpretations)
      await logger.log(
        LogEventId.ScannerEvent,
        'system',
        { message: `Event: ${event.type}` },
        (logLine: LogLine) => debugEvents(logLine.message)
      );
    })
    .onChange(async (context, previousContext) => {
      if (!previousContext) return;
      const changed = Object.entries(context)
        .filter(
          ([key, value]) => previousContext[key as keyof Context] !== value
        )
        // We only log fields that are key for understanding state machine
        // behavior, since others would be too verbose (e.g. scanner client
        // object)
        .filter(([key]) =>
          [
            'scannedSheet',
            'interpretation',
            'error',
            'failedScanAttempts',
          ].includes(key)
        )
        // To protect voter privacy, only log the interpretation type
        .map(([key, value]) =>
          key === 'interpretation' ? [key, value?.type] : [key, value]
        )
        // Make sure we log the important fields of an error
        .map(([key, value]) =>
          key === 'error' && value instanceof Error
            ? [key, { ...value, message: value.message, stack: value.stack }]
            : [key, value]
        )
        .map(([key, value]) => [
          key,
          value === undefined ? 'undefined' : value,
        ]);

      if (changed.length === 0) return;
      await logger.log(
        LogEventId.ScannerStateChanged,
        'system',
        {
          message: `Context updated`,
          changedFields: JSON.stringify(Object.fromEntries(changed)),
        },
        () => debug('Context updated: %o', Object.fromEntries(changed))
      );
    })
    .onTransition(async (state) => {
      if (!state.changed) return;
      await logger.log(
        LogEventId.ScannerStateChanged,
        'system',
        { message: `Transitioned to: ${JSON.stringify(state.value)}` },
        (logLine: LogLine) => debug(logLine.message)
      );
    });
}

function errorToString(error: NonNullable<Context['error']>) {
  return error instanceof PrecinctScannerError ? error.type : 'client_error';
}

/**
 * Creates the state machine for the precinct scanner.
 *
 * The machine tracks the state of the precinct scanner app, which adds a layer
 * of logic for scanning and interpreting ballots on top of the Custom scanner
 * API (which is the source of truth for the actual hardware state).
 *
 * The machine transitions between states in response to commands (e.g. scan or
 * accept) as well as in response to the paper status events from the scanner
 * (e.g. paper inserted).
 *
 * It's implemented using XState (https://xstate.js.org/docs/).
 */
export function createPrecinctScannerStateMachine({
  createCustomClient,
  workspace,
  interpret = defaultInterpret,
  logger,
  delays = {},
}: {
  createCustomClient?: CreateCustomClient;
  workspace: Workspace;
  interpret?: InterpretFn;
  logger: Logger;
  delays?: Partial<Delays>;
}): PrecinctScannerStateMachine {
  const machine = buildMachine({
    createCustomClient,
    workspace,
    interpret,
    delayOverrides: delays,
  });
  const machineService = interpretStateMachine(machine).start();
  setupLogging(machineService, logger);

  return {
    status: (): PrecinctScannerMachineStatus => {
      const { state } = machineService;
      const scannerState = (() => {
        // We use state.matches as recommended by the XState docs. This allows
        // us to add new substates to a state without breaking this switch.
        switch (true) {
          case state.matches('error'):
            return 'recovering_from_error';
          case state.matches('connecting'):
            return 'connecting';
          case state.matches('checking_initial_paper_status'):
            return 'connecting';
          case state.matches('checking_paper_status_after_scan'):
            return 'accepted';
          case state.matches('disconnected'):
            return 'disconnected';
          case state.matches('no_paper'):
            return 'no_paper';
          case state.matches('ready_to_scan'):
            return 'ready_to_scan';
          case state.matches('scanning'):
            return 'scanning';
          case state.matches('interpreting'):
            return 'scanning';
          case state.matches('ready_to_accept'):
            return 'ready_to_accept';
          case state.matches('accepting'):
            return 'accepting';
          case state.matches('accepted'):
            return 'accepted';
          case state.matches('needs_review'):
            return 'needs_review';
          case state.matches('accepting_after_review'):
            return 'accepting_after_review';
          case state.matches('returning'):
            return 'returning';
          case state.matches('returning_to_rescan'):
            return 'returning_to_rescan';
          case state.matches('returned'):
            return 'returned';
          case state.matches('rejecting'):
            return 'rejecting';
          case state.matches('rejected'):
            return 'rejected';
          case state.matches('double_sheet_jam_cleared'):
            return 'double_sheet_jammed';
          case state.matches('double_sheet'):
            return 'double_sheet_jammed';
          case state.matches('internal_jam'):
            return 'jammed';
          case state.matches('jam_cleared'):
            return 'jammed';
          case state.matches('jam'):
            return 'jammed';
          case state.matches('both_sides_have_paper_while_scanning'):
            return 'both_sides_have_paper';
          default:
            throw new Error(`Unexpected state: ${state.value}`);
        }
      })();
      const { error, interpretation } = state.context;

      // Remove interpretation details that are only used internally (e.g. sheetId, pages)
      const interpretationResult: SheetInterpretation | undefined = (() => {
        if (!interpretation) return undefined;
        switch (interpretation.type) {
          case 'ValidSheet':
            return { type: interpretation.type };
          case 'InvalidSheet':
            return {
              type: interpretation.type,
              reason: interpretation.reason,
            };
          case 'NeedsReviewSheet':
            return {
              type: interpretation.type,
              reasons: interpretation.reasons,
            };
          /* c8 ignore next 2 */
          default:
            throwIllegalValue(interpretation, 'type');
        }
      })();

      const stateNeedsErrorDetails = [
        'rejecting',
        'rejected',
        'recovering_from_error',
      ].includes(scannerState);
      const errorDetails =
        error && stateNeedsErrorDetails ? errorToString(error) : undefined;

      return {
        state: scannerState,
        interpretation: interpretationResult,
        error: errorDetails,
      };
    },

    scan: () => {
      machineService.send('SCAN');
    },

    accept: () => {
      machineService.send('ACCEPT');
    },

    return: () => {
      machineService.send('RETURN');
    },

    supportsUltrasonic: () => {
      return true;
    },
  };
}
