import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import {
  assert,
  assertDefined,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  CustomScanner,
  DoubleSheetDetectOpt,
  ErrorCode,
  FormMovement,
  FormStanding,
  ImageColorDepthType,
  ImageResolution,
  openScanner,
  ScannerStatus,
  ScanSide,
  SensorStatus,
} from '@votingworks/custom-scanner';
import { fromGrayScale, ImageData } from '@votingworks/image-utils';
import { BaseLogger, LogEventId, LogLine } from '@votingworks/logging';
import { mapSheet, SheetInterpretation, SheetOf } from '@votingworks/types';
import { UsbDrive } from '@votingworks/usb-drive';
import { v4 as uuid } from 'uuid';
import {
  Assigner,
  BaseActionObject,
  createMachine,
  Interpreter,
  interpret as interpretStateMachine,
  InvokeConfig,
  PropertyAssigner,
  sendParent,
  StateNodeConfig,
  TransitionConfig,
  assign as xassign,
} from 'xstate';
import { escalate } from 'xstate/lib/actions';
import { Clock } from 'xstate/lib/interpreter';
import { isReadyToScan } from '../../app_flow';
import { interpret as defaultInterpret, InterpretFn } from '../../interpret';
import {
  InterpretationResult,
  PrecinctScannerError,
  PrecinctScannerMachineStatus,
  PrecinctScannerStateMachine,
} from '../../types';
import { rootDebug } from '../../util/debug';
import { Workspace } from '../../util/workspace';
import {
  cleanLogData,
  recordAcceptedSheet,
  recordRejectedSheet,
} from '../shared';

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

interface Context {
  client?: CustomScanner;
  auth: InsertedSmartCardAuthApi;
  workspace: Workspace;
  usbDrive: UsbDrive;
  scannedSheet?: SheetOf<ImageData>;
  interpretation?: InterpretationResult;
  error?: Error | ErrorCode;
  failedScanAttempts?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assign(arg: Assigner<Context, any> | PropertyAssigner<Context, any>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return xassign<Context, any>(arg);
}

export type ScannerStatusEvent =
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
  DELAY_PAPER_STATUS_POLLING_INTERVAL_DURING_ACCEPT: number;
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
  DELAY_APP_READY_TO_SCAN_POLLING_INTERVAL: number;
}

export const delays = {
  // Time between calls to get paper status from the scanner.
  DELAY_PAPER_STATUS_POLLING_INTERVAL: 500,
  // Time between calls to get paper status from the scanner during ballot accept. We poll at a
  // higher rate during accept to ensure that we quickly catch edge cases like quick insertions of
  // a second ballot.
  DELAY_PAPER_STATUS_POLLING_INTERVAL_DURING_ACCEPT: 250,
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
  // When scanning is paused (e.g. when a card is inserted), how often to
  // recheck if scanning has been unpaused.
  DELAY_APP_READY_TO_SCAN_POLLING_INTERVAL: 500,
} satisfies Delays;

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

export function scannerStatusToEvent(
  scannerStatus: ScannerStatus
): ScannerStatusEvent {
  const allFrontSensorsDetectPaper =
    scannerStatus.sensorInputLeftLeft === SensorStatus.PaperPresent &&
    scannerStatus.sensorInputCenterLeft === SensorStatus.PaperPresent &&
    scannerStatus.sensorInputCenterRight === SensorStatus.PaperPresent &&
    scannerStatus.sensorInputRightRight === SensorStatus.PaperPresent;
  const someFrontSensorsDetectPaper =
    scannerStatus.sensorInputLeftLeft === SensorStatus.PaperPresent ||
    scannerStatus.sensorInputCenterLeft === SensorStatus.PaperPresent ||
    scannerStatus.sensorInputCenterRight === SensorStatus.PaperPresent ||
    scannerStatus.sensorInputRightRight === SensorStatus.PaperPresent;

  // sensorOutputLeftLeft and sensorOutputRightRight exist past the back rollers. For reasons
  // described below, we intentionally ignore the signal from them.
  const someBackSensorsUnderRollersDetectPaper =
    scannerStatus.sensorOutputCenterLeft === SensorStatus.PaperPresent ||
    scannerStatus.sensorOutputCenterRight === SensorStatus.PaperPresent;

  if (scannerStatus.isScannerCoverOpen) {
    return { type: 'SCANNER_DISCONNECTED' };
  }

  if (scannerStatus.isPaperJam || scannerStatus.isJamPaperHeldBack) {
    if (
      !someFrontSensorsDetectPaper &&
      !someBackSensorsUnderRollersDetectPaper
    ) {
      return { type: 'SCANNER_JAM_CLEARED' };
    }

    if (scannerStatus.isDoubleSheet) {
      return { type: 'SCANNER_JAM_DOUBLE_SHEET' };
    }

    return { type: 'SCANNER_JAM' };
  }

  // Paper past the back rollers but caught on, say, the emergency ballot bag should not be
  // considered still in the scanner. Continuing to spin the rollers won't clear the paper. Rather,
  // scanning the next ballot will.
  if (!allFrontSensorsDetectPaper && !someBackSensorsUnderRollersDetectPaper) {
    return { type: 'SCANNER_NO_PAPER' };
  }

  // Wait for all and not just some of the front sensors to detect paper before scanning to ensure
  // proper alignment
  if (allFrontSensorsDetectPaper && !someBackSensorsUnderRollersDetectPaper) {
    return { type: 'SCANNER_READY_TO_SCAN' };
  }

  if (!someFrontSensorsDetectPaper && someBackSensorsUnderRollersDetectPaper) {
    return { type: 'SCANNER_READY_TO_EJECT' };
  }

  if (someFrontSensorsDetectPaper && someBackSensorsUnderRollersDetectPaper) {
    return { type: 'SCANNER_BOTH_SIDES_HAVE_PAPER' };
  }

  throw new Error(
    `scannerStatusToEvent cases are non-exhaustive (scannerStatus = ${JSON.stringify(
      scannerStatus
    )})`
  );
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

async function reset({ client }: Context): Promise<void> {
  assert(client);
  debug('Resetting hardware');
  const result = await client.resetHardware();
  result.unsafeUnwrap();
}

async function scan({
  client,
  workspace,
}: Context): Promise<SheetOf<ImageData>> {
  assert(client);
  debug('Scanning');
  const isDoubleSheetDetectionDisabled =
    workspace.store.getIsDoubleFeedDetectionDisabled();
  const scanResult = await client.scan({
    wantedScanSide: ScanSide.A_AND_B,
    resolution: ImageResolution.RESOLUTION_200_DPI,
    imageColorDepth: ImageColorDepthType.Grey8bpp,
    formStandingAfterScan: FormStanding.HOLD_TICKET,
    doubleSheetDetection: isDoubleSheetDetectionDisabled
      ? DoubleSheetDetectOpt.DetectOff
      : DoubleSheetDetectOpt.Level1,
  });
  debug('Scan result: %o', scanResult);
  const images = scanResult.unsafeUnwrap();

  return mapSheet(images, (image) =>
    fromGrayScale(image.imageBuffer, image.imageWidth, image.imageHeight)
  );
}

async function interpretSheet(
  interpret: InterpretFn,
  { scannedSheet, workspace }: Context
): Promise<InterpretationResult> {
  assert(scannedSheet);
  const sheetId = uuid();
  const { store } = workspace;
  const interpretation = (
    await interpret(sheetId, scannedSheet, {
      electionDefinition: assertDefined(store.getElectionRecord())
        .electionDefinition,
      precinctSelection: assertDefined(store.getPrecinctSelection()),
      testMode: store.getTestMode(),
      ballotImagesPath: workspace.ballotImagesPath,
      markThresholds: store.getMarkThresholds(),
      adjudicationReasons: store.getAdjudicationReasons(),
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
  const result = await client.move(FormMovement.EJECT_PAPER_FORWARD);
  debug('Accept result: %o', result);
  return result.unsafeUnwrap();
}

async function reject({ client }: Context) {
  assert(client);
  debug('Rejecting');
  const result = await client.move(FormMovement.RETRACT_PAPER_BACKWARD);
  debug('Reject result: %o', result);
  return result.unsafeUnwrap();
}

async function finishAccept({ client }: Context) {
  assert(client);
  debug('Finishing accept');
  const result = await client.move(FormMovement.STOP);
  debug('Finish accept result: %o', result);
  return result.unsafeUnwrap();
}

async function finishAcceptAndLoadPaper({ client }: Context) {
  assert(client);
  debug('Finishing accept and loading paper');
  const result = await client.move(FormMovement.LOAD_PAPER);
  debug('Finish accept and load paper result: %o', result);
  return result.unsafeUnwrap();
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
  auth,
  workspace,
  interpret,
  usbDrive,
}: {
  createCustomClient?: CreateCustomClient;
  auth: InsertedSmartCardAuthApi;
  workspace: Workspace;
  interpret: InterpretFn;
  usbDrive: UsbDrive;
}) {
  const { store } = workspace;

  function isShoeshineModeEnabled() {
    return Boolean(
      assertDefined(store.getSystemSettings()).precinctScanEnableShoeshineMode
    );
  }

  function pollPaperStatus(
    pollingIntervalDelay: keyof Delays = 'DELAY_PAPER_STATUS_POLLING_INTERVAL'
  ): InvokeConfig<Context, Event> {
    return {
      src: createMachine<Pick<Context, 'client'>>(
        {
          id: 'poll_paper_status',
          strict: true,
          predictableActionArguments: true,

          initial: 'querying',
          states: {
            querying: {
              invoke: {
                src: async ({ client }) => {
                  const status = await assertDefined(client).getStatus();
                  debugPaperStatus('Paper status: %o', status);
                  const mapped = status.isOk()
                    ? scannerStatusToEvent(status.ok())
                    : scannerStatusErrorToEvent(status.err());
                  debugPaperStatus('Mapped paper status: %o', mapped);
                  return mapped;
                },
                onDone: {
                  target: 'waiting',
                  actions: sendParent((_, event) => event.data),
                },
              },
              after: {
                DELAY_PAPER_STATUS_POLLING_TIMEOUT: {
                  actions: escalate(
                    new PrecinctScannerError('paper_status_timed_out')
                  ),
                },
              },
            },
            waiting: {
              after: { [pollingIntervalDelay]: 'querying' },
            },
          },
        },
        { delays }
      ),
      data: (context) => ({ client: context.client }),
      onError: {
        target: '#error',
        actions: assign({ error: (_, event) => event.data }),
      },
    };
  }

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
        invoke: pollPaperStatus(
          'DELAY_PAPER_STATUS_POLLING_INTERVAL_DURING_ACCEPT'
        ),
        on: {
          SCANNER_NO_PAPER: 'finish_accept',
          // If there's a paper in front, that means the ballot in back did get
          // dropped but somebody quickly inserted a new ballot in front, so we
          // should count the first ballot as accepted.
          SCANNER_READY_TO_SCAN: 'finish_accept_and_load_paper',
          // Sometimes the accept command will complete successfully even though
          // the ballot hasn't been dropped yet (e.g. if it's stuck), so we wait
          // a bit to see if it gets dropped.
          SCANNER_READY_TO_EJECT: doNothing,
          // Sometimes the accept command will complete successfully even though
          // the ballot hasn't been dropped yet (e.g. if it's stuck), so we wait
          // a bit to see if it gets dropped.
          SCANNER_BOTH_SIDES_HAVE_PAPER: 'finish_accept_and_load_paper',
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
      finish_accept: {
        invoke: {
          // This stops the rollers once the ballot has cleared the scanner, as an additional
          // safeguard against accidental intake of a second ballot without tabulation
          src: finishAccept,
          onDone: '#accepted',
          // The ballot has already cleared the scanner by this point, and stopping the rollers
          // isn't strictly necessary. So we should not interrupt the transition to the accepted
          // state and subsequent counting of the ballot if stopping the rollers fails. The rollers
          // will still stop of their own accord in ~1.3s.
          onError: '#accepted',
        },
      },
      // This occurs when paper is seen while the ballot is being accepted.
      finish_accept_and_load_paper: {
        invoke: {
          // Stop the accept action by triggering the load paper command.
          src: finishAcceptAndLoadPaper,
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
          entry: (context) =>
            recordRejectedSheet(workspace, usbDrive, context.interpretation),
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
          invoke: pollPaperStatus(),
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
      predictableActionArguments: true,
      context: { auth, workspace, usbDrive },
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
            error: ({ error, failedScanAttempts, interpretation }, event) => {
              // eslint-disable-next-line no-console
              console.error(event, {
                error,
                failedScanAttempts,
                interpretation,
              });
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
          invoke: pollPaperStatus(),
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
          invoke: pollPaperStatus(),
          on: {
            SCANNER_NO_PAPER: 'no_paper',
            SCANNER_BOTH_SIDES_HAVE_PAPER: {
              target: 'returning_to_rescan',
            },
            SCANNER_READY_TO_EJECT: {
              target: 'returning_to_rescan',
            },
            // We can automatically start scanning the next ballot
            SCANNER_READY_TO_SCAN: 'hardware_ready_to_scan',
          },
        },
        no_paper: {
          id: 'no_paper',
          entry: [clearError, clearLastScan],
          invoke: pollPaperStatus(),
          on: {
            SCANNER_NO_PAPER: doNothing,
            SCANNER_READY_TO_SCAN: 'hardware_ready_to_scan',
            SCANNER_BOTH_SIDES_HAVE_PAPER: 'jam',
          },
        },
        hardware_ready_to_scan: {
          id: 'hardware_ready_to_scan',
          entry: [clearError, clearLastScan],
          invoke: pollPaperStatus(),
          on: {
            SCAN: 'scanning',
            SCANNER_NO_PAPER: 'no_paper',
            SCANNER_READY_TO_SCAN: doNothing,
          },
          initial: 'checking_app_ready_to_scan',
          states: {
            checking_app_ready_to_scan: {
              invoke: {
                src: async () => isReadyToScan({ auth, store, usbDrive }),
                onDone: [
                  {
                    target: '#scanning',
                    cond: (_context, event) => event.data,
                  },
                  {
                    target: 'waiting',
                  },
                ],
              },
            },
            waiting: {
              after: {
                DELAY_APP_READY_TO_SCAN_POLLING_INTERVAL:
                  'checking_app_ready_to_scan',
              },
            },
          },
        },
        scanning: {
          id: 'scanning',
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
              invoke: pollPaperStatus(),
              on: {
                SCANNER_READY_TO_EJECT: '#interpreting',
              },
            },
            handle_paper_jam: {
              after: { DELAY_JAM_WHEN_SCANNING: 'route_paper_jam' },
            },
            route_paper_jam: {
              invoke: pollPaperStatus(),
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
          invoke: pollPaperStatus(),
          on: {
            ACCEPT: [
              { cond: isShoeshineModeEnabled, target: 'accepted' },
              { target: 'accepting' },
            ],
            SCANNER_READY_TO_EJECT: doNothing,
          },
        },
        accepting: acceptingState,
        accepted: {
          id: 'accepted',
          entry: (context) =>
            recordAcceptedSheet(
              workspace,
              usbDrive,
              assertDefined(context.interpretation)
            ),
          invoke: pollPaperStatus(),
          initial: 'scanning_paused',
          on: { SCANNER_NO_PAPER: doNothing },
          states: {
            scanning_paused: {
              on: {
                SCANNER_READY_TO_SCAN: doNothing,
                SCANNER_BOTH_SIDES_HAVE_PAPER: doNothing,
                SCANNER_JAM: doNothing,
                SCANNER_JAM_DOUBLE_SHEET: doNothing,
                SCANNER_JAM_CLEARED: doNothing,
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
          invoke: pollPaperStatus(),
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
          invoke: pollPaperStatus(),
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
          invoke: pollPaperStatus(),
          on: {
            SCANNER_READY_TO_SCAN: doNothing,
            SCANNER_NO_PAPER: 'no_paper',
          },
        },
        // There is a jam that the custom scanner itself has notified us of. We have
        // to reset the hardware in order to clear the jam when done.
        internal_jam: {
          id: 'internal_jam',
          invoke: pollPaperStatus(),
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
          invoke: pollPaperStatus(),
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
              invoke: pollPaperStatus(),
              on: {
                SCANNER_NO_PAPER: '#no_paper',
                SCANNER_BOTH_SIDES_HAVE_PAPER: doNothing,
                SCANNER_JAM: doNothing,
                SCANNER_READY_TO_SCAN: '#hardware_ready_to_scan',
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
          invoke: pollPaperStatus(),
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
    { delays }
  );
}

function setupLogging(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  machineService: Interpreter<Context, any, Event, any, any>,
  logger: BaseLogger
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
          changedFields: JSON.stringify(
            Object.fromEntries(changed),
            cleanLogData
          ),
        },
        () => debug('Context updated: %o', Object.fromEntries(changed))
      );
    })
    .onTransition(async (state) => {
      if (!state.changed) return;
      await logger.log(
        LogEventId.ScannerStateChanged,
        'system',
        {
          message: `Transitioned to: ${JSON.stringify(
            state.value,
            cleanLogData
          )}`,
        },
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
  auth,
  workspace,
  interpret = defaultInterpret,
  logger,
  usbDrive,
  clock,
}: {
  createCustomClient?: CreateCustomClient;
  auth: InsertedSmartCardAuthApi;
  workspace: Workspace;
  interpret?: InterpretFn;
  logger: BaseLogger;
  usbDrive: UsbDrive;
  clock?: Clock;
}): PrecinctScannerStateMachine {
  const machine = buildMachine({
    createCustomClient,
    auth,
    workspace,
    interpret,
    usbDrive,
  });
  const machineService = interpretStateMachine(
    machine,
    clock && { clock }
  ).start();
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
          case state.matches('hardware_ready_to_scan'):
            return 'hardware_ready_to_scan';
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

    accept: () => {
      machineService.send('ACCEPT');
    },

    return: () => {
      machineService.send('RETURN');
    },

    stop: () => {
      machineService.stop();
    },

    /* c8 ignore start */
    beginDoubleFeedCalibration: () => {
      throw new Error('Not supported');
    },
    endDoubleFeedCalibration: () => {
      throw new Error('Not supported');
    },
    /* c8 ignore stop */
  };
}
