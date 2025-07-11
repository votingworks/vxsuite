import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import { Logger, LogEventId, LogLine } from '@votingworks/logging';
import {
  ScannerClient,
  ScannerError,
  ScannerEvent,
  ScannerStatus,
} from '@votingworks/pdi-scanner';
import {
  HmpbBallotPaperSize,
  InsertedSmartCardAuth,
  PrecinctScannerError,
  PrecinctScannerMachineStatus,
  SheetInterpretation,
  SheetOf,
  ballotPaperDimensions,
  mapSheet,
} from '@votingworks/types';
import { UsbDrive } from '@votingworks/usb-drive';
import { time, Timer } from '@votingworks/utils';
import assert from 'node:assert';
import { ImageData } from 'canvas';
import { v4 as uuid } from 'uuid';
import {
  ActorRef,
  BaseActionObject,
  EventObject,
  Interpreter,
  InvokeConfig,
  StateNodeConfig,
  assign,
  createMachine,
  interpret as interpretStateMachine,
  sendParent,
  spawn,
} from 'xstate';
import { Clock } from 'xstate/lib/interpreter';
import { runBlankPaperDiagnostic } from '@votingworks/ballot-interpreter';
import { writeImageData } from '@votingworks/image-utils';
import { join } from 'node:path';
import { isReadyToScan } from '../../app_flow';
import { interpret } from '../../interpret';
import { InterpretationResult, PrecinctScannerStateMachine } from '../../types';
import { rootDebug } from '../../util/debug';
import { Workspace } from '../../util/workspace';
import {
  cleanLogData,
  recordAcceptedSheet,
  recordRejectedSheet,
} from '../shared';
import { constructAuthMachineState } from '../../util/auth';

const debug = rootDebug.extend('state-machine');

let scanAndInterpretTimer: Timer | undefined;

async function interpretSheet(
  workspace: Workspace,
  scanImages: SheetOf<ImageData>
): Promise<InterpretationResult> {
  const sheetId = uuid();
  const { store } = workspace;

  const interpretTimer = time(debug, 'interpret');
  const {
    allowOfficialBallotsInTestMode,
    disableVerticalStreakDetection,
    markThresholds,
    precinctScanEnableBmdBallotScanning,
    minimumDetectedScale,
  } = assertDefined(store.getSystemSettings());
  const interpretation = (
    await interpret(sheetId, scanImages, {
      electionDefinition: assertDefined(store.getElectionRecord())
        .electionDefinition,
      precinctSelection: assertDefined(store.getPrecinctSelection()),
      testMode: store.getTestMode(),
      disableVerticalStreakDetection,
      ballotImagesPath: workspace.ballotImagesPath,
      markThresholds,
      adjudicationReasons: store.getAdjudicationReasons(),
      allowOfficialBallotsInTestMode,
      disableBmdBallotScanning: !precinctScanEnableBmdBallotScanning,
      minimumDetectedScale,
    })
  ).unsafeUnwrap();
  interpretTimer.end();
  return {
    ...interpretation,
    sheetId,
  };
}

function anyRearSensorCovered(status: ScannerStatus): boolean {
  return status.rearLeftSensorCovered || status.rearRightSensorCovered;
}

function anyFrontSensorCovered(status: ScannerStatus): boolean {
  // frontM5SensorCovered and frontRightSensorCovered are not used by the
  // PageScan 6 scanner, so we don't need to check them
  return (
    status.frontLeftSensorCovered ||
    status.frontM1SensorCovered ||
    status.frontM2SensorCovered ||
    status.frontM3SensorCovered ||
    status.frontM4SensorCovered
  );
}

async function runScannerDiagnostic(
  workspace: Workspace,
  scanImages: SheetOf<ImageData>
) {
  const sheetId = uuid();
  const [frontPath, backPath] = await mapSheet(
    scanImages,
    async (image, side) => {
      const path = join(
        workspace.scannedImagesPath,
        `diagnostic-${sheetId}-${side}.png`
      );
      await writeImageData(path, image);
      return path;
    }
  );
  return (
    runBlankPaperDiagnostic(frontPath) && runBlankPaperDiagnostic(backPath)
  );
}

interface Context {
  scanImages?: SheetOf<ImageData>;
  interpretation?: InterpretationResult;
  error?: ScannerError | PrecinctScannerError | Error;
  rootListenerRef?: ActorRef<Event>;
}

type Event =
  | {
      type: 'SCANNER_STATUS';
      status: ScannerStatus;
    }
  | {
      type: 'SCANNER_EVENT';
      event: ScannerEvent;
    }
  | {
      type: 'SCANNER_ERROR';
      error: ScannerError;
    }
  | { type: 'ACCEPT' }
  | { type: 'RETURN' }
  | { type: 'READY_FOR_NEXT_BALLOT' }
  | { type: 'SCANNING_ENABLED' }
  | { type: 'SCANNING_DISABLED' }
  | { type: 'BEGIN_DOUBLE_FEED_CALIBRATION' }
  | { type: 'END_DOUBLE_FEED_CALIBRATION' }
  | { type: 'BEGIN_IMAGE_SENSOR_CALIBRATION' }
  | { type: 'END_IMAGE_SENSOR_CALIBRATION' }
  | { type: 'BEGIN_SCANNER_DIAGNOSTIC' }
  | { type: 'END_SCANNER_DIAGNOSTIC' }
  | { type: 'AUTH_STATUS'; status: InsertedSmartCardAuth.AuthStatus };

function isEventUserAction(event: EventObject): boolean {
  if (event.type === 'SCANNER_EVENT') {
    if ('event' in event && event.event) {
      const subEvent = event.event as EventObject;
      return 'event' in subEvent && subEvent.event === 'scanStart';
    }
  }
  return [
    'ACCEPT',
    'RETURN',
    'BEGIN_DOUBLE_FEED_CALIBRATION',
    'END_DOUBLE_FEED_CALIBRATION',
    'BEGIN_IMAGE_SENSOR_CALIBRATION',
    'END_IMAGE_SENSOR_CALIBRATION',
    'BEGIN_SCANNER_DIAGNOSTIC',
    'END_SCANNER_DIAGNOSTIC',
  ].includes(event.type);
}

export interface Delays {
  /**
   * How often to check that scanning is enabled (i.e. voter auth, etc).
   */
  DELAY_SCANNING_ENABLED_POLLING_INTERVAL: number;
  /**
   * Time between calls to get the scanner status.
   */
  DELAY_SCANNER_STATUS_POLLING_INTERVAL: number;
  /**
   * Time to wait after disconnection before attempting to reconnect (either on
   * unplug or on reconnecting after an error).
   */
  DELAY_RECONNECT: number;
  /**
   * How long to attempt scanning before giving up and disconnecting and
   * reconnecting to the scanner.
   */
  DELAY_SCANNING_TIMEOUT: number;
  /**
   * How long to attempt accepting a ballot before giving up and declaring a
   * jam.
   */
  DELAY_ACCEPTING_TIMEOUT: number;
  /**
   * How often to check auth status (used only during scanner diagnostic to see
   * if card was removed during diagnostic).
   */
  DELAY_AUTH_STATUS_POLLING_INTERVAL: number;
}

export const delays = {
  DELAY_SCANNING_ENABLED_POLLING_INTERVAL: 500,
  DELAY_SCANNER_STATUS_POLLING_INTERVAL: 500,
  DELAY_RECONNECT: 500,
  DELAY_SCANNING_TIMEOUT: 5_000,
  DELAY_ACCEPTING_TIMEOUT: 5_000,
  DELAY_AUTH_STATUS_POLLING_INTERVAL: 500,
} satisfies Delays;

function buildMachine({
  scannerClient,
  workspace,
  usbDrive,
  auth,
  logger,
}: {
  scannerClient: ScannerClient;
  workspace: Workspace;
  usbDrive: UsbDrive;
  auth: InsertedSmartCardAuthApi;
  logger: Logger;
}) {
  const { store } = workspace;

  function isShoeshineModeEnabled() {
    return Boolean(
      assertDefined(store.getSystemSettings()).precinctScanEnableShoeshineMode
    );
  }

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

  const pollScanningEnabled: InvokeConfig<Context, Event> = {
    src: createPollingChildMachine(
      'pollScanningEnabled',
      async () => {
        const enabled = await isReadyToScan({ auth, store, usbDrive });
        return enabled
          ? { type: 'SCANNING_ENABLED' }
          : { type: 'SCANNING_DISABLED' };
      },
      'DELAY_SCANNING_ENABLED_POLLING_INTERVAL'
    ),
  };

  const pollScannerStatus: InvokeConfig<Context, Event> = {
    src: createPollingChildMachine(
      'pollScannerStatus',
      async () => {
        const timer = time(debug, 'getScannerStatus');
        const statusResult = await scannerClient.getScannerStatus();
        timer.end();
        return statusResult.isOk()
          ? { type: 'SCANNER_STATUS', status: statusResult.ok() }
          : { type: 'SCANNER_ERROR', error: statusResult.err() };
      },
      'DELAY_SCANNER_STATUS_POLLING_INTERVAL'
    ),
  };

  const pollAuthStatus: InvokeConfig<Context, Event> = {
    src: createPollingChildMachine(
      'pollAuthStatus',
      async () => {
        const status = await auth.getAuthStatus(
          constructAuthMachineState(store)
        );
        return { type: 'AUTH_STATUS', status };
      },
      'DELAY_AUTH_STATUS_POLLING_INTERVAL'
    ),
  };

  // To ensure we catch scanner events no matter what state the machine is in,
  // we spawn a long-lived actor that is referenced in the context (rather than
  // invoking it in a specific state).
  const listenForScannerEventsAtRoot = assign<Context>({
    rootListenerRef: () =>
      spawn((callback) => {
        const listener = scannerClient.addListener((event) => {
          switch (event.event) {
            case 'scanStart': {
              scanAndInterpretTimer = time(debug, 'scanAndInterpret');
              break;
            }

            default:
              scanAndInterpretTimer?.checkpoint(event.event);
              break;
          }
          callback(
            event.event === 'error'
              ? { type: 'SCANNER_ERROR', error: event }
              : { type: 'SCANNER_EVENT', event }
          );
        });
        return () => scannerClient.removeListener(listener);
      }),
  });

  const rejectingState: StateNodeConfig<
    Context,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    Event,
    BaseActionObject
  > = {
    initial: 'starting',
    states: {
      starting: {
        entry: (context) =>
          recordRejectedSheet(
            workspace,
            usbDrive,
            context.interpretation,
            logger
          ),
        invoke: [
          {
            src: async () => {
              (
                await scannerClient.ejectDocument('toFrontAndHold')
              ).unsafeUnwrap();
            },
            onDone: 'checkingComplete',
            onError: {
              target: '#error',
              actions: assign({ error: (_, event) => event.data }),
            },
          },
        ],
      },
      checkingComplete: {
        invoke: pollScannerStatus,
        on: {
          SCANNER_STATUS: [
            {
              cond: (_, { status }) => !anyRearSensorCovered(status),
              target: 'ejected',
            },
            {
              cond: (_, { status }) => status.documentJam,
              target: '#jammed',
            },
          ],
        },
      },
      ejected: { type: 'final' },
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
    // The scanner will catch paper inserted into the front during the eject
    // and emit an ejectPaused event. This might happen in our starting or
    // checkingComplete states, so we catch it here.
    on: {
      SCANNER_EVENT: {
        cond: (_, { event }) => event.event === 'ejectPaused',
        target: '.paperInFront',
      },
    },
    states: {
      starting: {
        invoke: [
          {
            src: async () => {
              /* istanbul ignore next - @preserve */
              scanAndInterpretTimer?.checkpoint('accepting');
              (await scannerClient.ejectDocument('toRear')).unsafeUnwrap();
              /* istanbul ignore next - @preserve */
              scanAndInterpretTimer?.checkpoint('eject command sent');
            },
            onDone: 'checkingComplete',
            onError: {
              target: '#error',
              actions: assign({ error: (_, event) => event.data }),
            },
          },
        ],
      },
      paperInFront: {
        on: {
          SCANNER_EVENT: {
            cond: (_, { event }) => event.event === 'ejectResumed',
            target: 'checkingComplete',
          },
        },
      },
      checkingComplete: {
        invoke: pollScannerStatus,
        on: {
          SCANNER_STATUS: [
            /**
             * If the ballot jams during accept, it probably means the ballot box is
             * full or something is blocking the opening. Since the ballot is already
             * in the rear of the scanner when we start accepting, we declare it
             * accepted even during a jam. Though it may still be covering the rear
             * sensors, the rollers will have released it, so it can fall into the
             * box. This jam will be identified and displayed to the user as an
             * outfeed_blocked jam before any more ballots can be scanned.
             */
            {
              cond: (_, { status }) => status.documentJam,
              target: '#accepted',
            },
            {
              cond: (_, { status }) => !anyRearSensorCovered(status),
              target: '#accepted',
            },
          ],
        },
        // If the ballot jams during accept, we don't usually get a documentJam
        // status, so we need to catch it with a timeout instead.
        after: {
          DELAY_ACCEPTING_TIMEOUT: {
            target: '#accepted',
          },
        },
      },
    },
  };

  return createMachine<Context, Event>(
    {
      id: 'precinct_scanner',
      strict: true,
      predictableActionArguments: true,

      context: {},

      // Listen for scanner events at the root level (see rootListenerRef to see
      // how the listener is created).
      on: {
        SCANNER_EVENT: [
          {
            cond: (_, { event }) => event.event === 'coverOpen',
            target: 'coverOpen',
          },
          {
            // We don't need coverClosed events, since we check for the
            // coverOpen flag in the status instead when we're in the coverOpen
            // state. But we don't want to treat it as an unexpected event, so
            // we just do nothing,
            cond: (_, { event }) => event.event === 'coverClosed',
            target: undefined,
          },
          {
            target: '#error',
            actions: assign({
              error:
                /* istanbul ignore next - fallback case, shouldn't happen - @preserve */
                (_, { event }) =>
                  new PrecinctScannerError(
                    'unexpected_event',
                    `Unexpected event: ${event.event}`
                  ),
            }),
          },
        ],
        SCANNER_ERROR: {
          target: 'error',
          actions: assign({ error: (_, { error }) => error }),
        },
      },

      initial: 'connecting',
      states: {
        connecting: {
          entry: listenForScannerEventsAtRoot,
          invoke: {
            src: async () => (await scannerClient.connect()).unsafeUnwrap(),
            onDone: 'checkingInitialStatus',
            onError: {
              target: 'error',
              actions: assign({ error: (_, event) => event.data }),
            },
          },
        },

        checkingInitialStatus: {
          id: 'checkingInitialStatus',
          invoke: pollScannerStatus,
          on: {
            SCANNER_STATUS: [
              // We need to check for coverOpen on connect, since we won't get
              // an event (since the cover is already open).
              {
                cond: (_, { status }) => status.coverOpen,
                target: '#coverOpen',
              },
              {
                cond: (_, { status }) => anyRearSensorCovered(status),
                target: '#rejecting',
                actions: [
                  assign({
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    error: (_context) =>
                      new PrecinctScannerError('paper_in_back_after_reconnect'),
                  }),
                ],
              },
              {
                cond: (_, { status }) => anyFrontSensorCovered(status),
                target: '#rejected',
                actions: assign({
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  error: (_context) =>
                    new PrecinctScannerError('paper_in_front_after_reconnect'),
                }),
              },
              { target: 'waitingForBallot' },
            ],
          },
        },

        // We don't poll scanner status while waiting for the ballot due to a
        // subtle race condition: it's possible for a scanner status request to
        // be sent to the scanner in between the time when it physically grabs
        // the ballot and when it sends an event to notify us that it started
        // scanning. When that occurs, the scan is interrupted.
        //
        // Since we don't poll scanner status, we have an initial check when
        // entering this state to ensure the scanner doesn't have a ballot in
        // the rear. (A ballot in the front is ok - we can scan it.)
        waitingForBallot: {
          id: 'waitingForBallot',
          entry: assign({
            scanImages: undefined,
            interpretation: undefined,
            error: undefined,
          }),
          initial: 'checkingStatus',
          states: {
            checkingStatus: {
              id: 'checkingStatus',
              invoke: pollScannerStatus,
              on: {
                SCANNER_STATUS: [
                  {
                    cond: (_, { status }) => anyRearSensorCovered(status),
                    target: '#jammed',
                    actions: assign({
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      error: (_context) =>
                        new PrecinctScannerError('outfeed_blocked'),
                    }),
                  },
                  { target: 'waiting' },
                ],
              },
            },
            waiting: {
              invoke: [
                pollScanningEnabled,
                {
                  src: async () => {
                    const electionRecord = store.getElectionRecord();
                    if (!electionRecord) return;
                    const bitonalThreshold = store.getBitonalThreshold();
                    const paperLengthInches = ballotPaperDimensions(
                      electionRecord.electionDefinition.election.ballotLayout
                        .paperSize
                    ).height;
                    const doubleFeedDetectionEnabled =
                      !store.getIsDoubleFeedDetectionDisabled();
                    (
                      await scannerClient.enableScanning({
                        bitonalThreshold,
                        doubleFeedDetectionEnabled,
                        paperLengthInches,
                      })
                    ).unsafeUnwrap();
                  },
                },
              ],
              on: {
                SCANNING_DISABLED: '#paused',
                SCANNER_EVENT: [
                  {
                    cond: (_, { event }) => event.event === 'scanStart',
                    target: '#scanning',
                  },
                ],
              },
            },
          },
        },

        paused: {
          id: 'paused',
          invoke: [
            {
              src: async () =>
                (await scannerClient.disableScanning()).unsafeUnwrap(),
            },
            pollScanningEnabled,
          ],
          on: {
            SCANNING_ENABLED: 'waitingForBallot',
            BEGIN_DOUBLE_FEED_CALIBRATION: 'calibratingDoubleFeedDetection',
            BEGIN_IMAGE_SENSOR_CALIBRATION: 'calibratingImageSensors',
            BEGIN_SCANNER_DIAGNOSTIC: 'scannerDiagnostic',
          },
        },

        scanning: {
          id: 'scanning',
          initial: 'waitingForScanComplete',
          states: {
            waitingForScanComplete: {
              on: {
                SCANNER_EVENT: [
                  {
                    cond: (context, { event }) =>
                      event.event === 'scanComplete' &&
                      context.error !== undefined,
                    target: '#rejecting',
                  },
                  {
                    cond: (_, { event }) => event.event === 'scanComplete',
                    actions: assign({
                      scanImages: (_, { event }) => {
                        assert(event.event === 'scanComplete');
                        return event.images;
                      },
                    }),
                    target: 'checkingComplete',
                  },
                ],
                SCANNER_ERROR: [
                  // A doubleFeedDetected event will either be followed by a
                  // scanFailed event or a scanComplete event (which both
                  // indicate that the scan actually stopped), so we don't
                  // transition states yet, just record that it happened.
                  // Otherwise, we'd have a scanFailed/scanComplete event come
                  // in later and be unhandled.
                  {
                    cond: (_, { error }) => error.code === 'doubleFeedDetected',
                    actions: assign({
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      error: (_context) =>
                        new PrecinctScannerError('double_feed_detected'),
                    }),
                  },
                  {
                    cond: (_, { error }) => error.code === 'scanFailed',
                    target: '#rejecting',
                    actions: assign({
                      error: (context) =>
                        // Don't overwrite the double_feed_detected error if
                        // we already caught that
                        context.error instanceof PrecinctScannerError &&
                        context.error.type === 'double_feed_detected'
                          ? context.error
                          : new PrecinctScannerError('scanning_failed'),
                    }),
                  },
                ],
              },
              after: {
                DELAY_SCANNING_TIMEOUT: {
                  target: '#error',
                  actions: assign({
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    error: (_context) =>
                      new PrecinctScannerError('scanning_timed_out'),
                  }),
                },
              },
            },
            checkingComplete: {
              invoke: pollScannerStatus,
              on: {
                SCANNER_STATUS: [
                  {
                    cond: (_, { status }) => status.documentJam,
                    target: '#rejecting',
                  },
                  // If you pull the ballot out before it can be fully scanned,
                  // we either get a scanFailed event (handled above) or a
                  // scanComplete event but documentInScanner=false.
                  {
                    cond: (_, { status }) => !status.documentInScanner,
                    target: '#waitingForBallot',
                  },
                  { target: '#interpreting' },
                ],
              },
            },
          },
        },

        interpreting: {
          id: 'interpreting',
          invoke: {
            src: async ({ scanImages }) => {
              /* istanbul ignore next - @preserve */
              scanAndInterpretTimer?.checkpoint('interpreting');
              const result = await interpretSheet(
                workspace,
                assertDefined(scanImages)
              );
              /* istanbul ignore next - @preserve */
              scanAndInterpretTimer?.checkpoint('interpretComplete');
              return result;
            },
            onDone: [
              {
                cond: (_, { data }) => data.type === 'ValidSheet',
                target: 'readyToAccept',
                actions: assign({ interpretation: (_, { data }) => data }),
              },
              {
                cond: (_, { data }) => data.type === 'InvalidSheet',
                target: 'rejecting',
                actions: assign({ interpretation: (_, { data }) => data }),
              },
              {
                cond: (_, { data }) => data.type === 'NeedsReviewSheet',
                target: 'needsReview',
                actions: assign({ interpretation: (_, { data }) => data }),
              },
            ],
            onError: {
              target: 'error',
              actions: assign({ error: (_, event) => event.data }),
            },
          },
        },

        readyToAccept: {
          always: [
            { cond: isShoeshineModeEnabled, target: 'accepted' },
            { target: 'accepting' },
          ],
        },

        accepting: acceptingState,

        accepted: {
          id: 'accepted',
          entry: async (context) => {
            /* istanbul ignore next - @preserve */
            scanAndInterpretTimer?.checkpoint('accepted');
            await recordAcceptedSheet(
              workspace,
              usbDrive,
              assertDefined(context.interpretation),
              logger
            );
            /* istanbul ignore next - @preserve */
            scanAndInterpretTimer?.checkpoint('recordAcceptedSheet complete');
            /* istanbul ignore next - @preserve */
            scanAndInterpretTimer?.end();
            scanAndInterpretTimer = undefined;
          },
          // We wait for the frontend to tell us that it is ready for the next
          // ballot. That way we can ensure that we showed the user confirmation
          // that their ballot was accepted before we re-enable scanning for the
          // next ballot.
          on: {
            READY_FOR_NEXT_BALLOT: [
              {
                cond: isShoeshineModeEnabled,
                target: 'shoeshineModeRescanningBallot',
              },
              { target: 'waitingForBallot' },
            ],
          },
        },

        rejecting: {
          id: 'rejecting',
          ...rejectingState,
          onDone: 'rejected',
        },

        rejected: {
          id: 'rejected',
          invoke: pollScannerStatus,
          on: {
            SCANNER_STATUS: [
              {
                cond: (_, { status }) => !status.documentInScanner,
                target: 'waitingForBallot',
              },
            ],
          },
        },

        needsReview: {
          on: {
            ACCEPT: 'acceptingAfterReview',
            RETURN: 'returning',
          },
        },

        acceptingAfterReview: acceptingState,

        returning: {
          ...rejectingState,
          onDone: 'returned',
        },

        returned: {
          invoke: pollScannerStatus,
          on: {
            SCANNER_STATUS: [
              {
                cond: (_, { status }) => !status.documentInScanner,
                target: 'waitingForBallot',
              },
            ],
          },
        },

        calibratingDoubleFeedDetection: {
          on: {
            SCANNER_EVENT: {
              cond: (_, { event }) =>
                event.event === 'doubleFeedCalibrationTimedOut',
              target: '.done',
              actions: assign({
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                error: (_context) =>
                  new PrecinctScannerError('double_feed_calibration_timed_out'),
              }),
            },
          },
          initial: 'doubleSheet',
          states: {
            doubleSheet: {
              invoke: {
                src: async () => {
                  (
                    await scannerClient.calibrateDoubleFeedDetection('double')
                  ).unsafeUnwrap();
                },
                onError: {
                  target: '#error',
                  actions: assign({ error: (_, event) => event.data }),
                },
              },
              on: {
                SCANNER_EVENT: {
                  cond: (_, { event }) =>
                    event.event === 'doubleFeedCalibrationComplete',
                  target: 'singleSheet',
                },
              },
            },
            singleSheet: {
              invoke: {
                src: async () => {
                  (
                    await scannerClient.calibrateDoubleFeedDetection('single')
                  ).unsafeUnwrap();
                },
                onError: {
                  target: '#error',
                  actions: assign({ error: (_, event) => event.data }),
                },
              },
              on: {
                SCANNER_EVENT: {
                  cond: (_, { event }) =>
                    event.event === 'doubleFeedCalibrationComplete',
                  target: 'done',
                },
              },
            },
            done: {
              on: {
                END_DOUBLE_FEED_CALIBRATION: '#paused',
              },
              exit: assign({ error: undefined }),
            },
          },
        },

        calibratingImageSensors: {
          on: {
            SCANNER_EVENT: {
              cond: (_, { event }) =>
                event.event === 'imageSensorCalibrationFailed',
              target: '.done',
              actions: assign({
                error: (_context, { event }) => {
                  assert(event.event === 'imageSensorCalibrationFailed');
                  return event.error === 'calibrationTimeoutError'
                    ? new PrecinctScannerError(
                        'image_sensor_calibration_timed_out'
                      )
                    : new PrecinctScannerError(
                        'image_sensor_calibration_failed',
                        event.error
                      );
                },
              }),
            },
          },
          initial: 'calibrating',
          states: {
            calibrating: {
              invoke: {
                src: async () => {
                  (await scannerClient.calibrateImageSensors()).unsafeUnwrap();
                },
                onError: {
                  target: '#error',
                  actions: assign({ error: (_, event) => event.data }),
                },
              },
              on: {
                SCANNER_EVENT: {
                  cond: (_, { event }) =>
                    event.event === 'imageSensorCalibrationComplete',
                  target: 'done',
                },
              },
            },
            done: {
              on: {
                END_IMAGE_SENSOR_CALIBRATION: '#paused',
              },
              exit: assign({ error: undefined }),
            },
          },
        },

        jammed: {
          id: 'jammed',
          invoke: pollScannerStatus,
          on: {
            SCANNER_STATUS: [
              {
                cond: (_, { status }) =>
                  !status.documentJam &&
                  !anyRearSensorCovered(status) &&
                  !anyFrontSensorCovered(status),
                target: 'waitingForBallot',
              },
            ],
          },
        },

        coverOpen: {
          id: 'coverOpen',
          invoke: [
            // The scanner will try to scan ballots (unsuccessfully) while the
            // cover is open - we have to explicitly disable scanning.
            {
              src: async () => {
                (await scannerClient.disableScanning()).unsafeUnwrap();
              },
            },
            pollScannerStatus,
          ],
          on: {
            SCANNER_STATUS: {
              cond: (_, { status }) => !status.coverOpen,
              target: 'waitingForBallot',
            },
          },
        },

        disconnected: {
          id: 'disconnected',
          initial: 'waiting',
          entry: assign({ interpretation: undefined }),
          states: {
            waiting: {
              after: {
                DELAY_RECONNECT: 'reconnecting',
              },
            },
            reconnecting: {
              invoke: {
                src: async () => (await scannerClient.connect()).unsafeUnwrap(),
                onDone: '#checkingInitialStatus',
                onError: {
                  target: '#error',
                  actions: assign({ error: (_, event) => event.data }),
                },
              },
            },
          },
        },

        error: {
          id: 'error',
          always: [
            {
              cond: (context) =>
                context.error !== undefined &&
                'code' in context.error &&
                context.error.code === 'disconnected',
              target: '#disconnected',
            },
            { target: '#unrecoverableError' },
          ],
        },

        unrecoverableError: { id: 'unrecoverableError' },

        shoeshineModeRescanningBallot: {
          initial: 'rescanning',
          entry: assign({ interpretation: undefined }),
          states: {
            rescanning: {
              invoke: {
                src: async () => {
                  (
                    await scannerClient.ejectDocument('toFrontAndRescan')
                  ).unsafeUnwrap();
                },
                onDone: 'waitingForScanStart',
                onError: {
                  target: '#error',
                  actions: assign({ error: (_, event) => event.data }),
                },
              },
            },
            waitingForScanStart: {
              on: {
                SCANNER_EVENT: [
                  {
                    cond: (_, { event }) => event.event === 'scanStart',
                    target: '#scanning',
                  },
                ],
              },
            },
          },
        },

        scannerDiagnostic: {
          invoke: pollAuthStatus,
          on: {
            // If the user removes their smart card during the diagnostic, cancel
            // the diagnostic
            AUTH_STATUS: [
              {
                cond: (_, { status }) => status.status === 'logged_out',
                target: '#waitingForBallot',
              },
            ],
            SCANNER_EVENT: {
              target: '.done',
              actions: assign({
                error: (_, { event }) =>
                  new PrecinctScannerError(
                    'unexpected_event',
                    `Unexpected scanner event: ${event.event}`
                  ),
              }),
            },
            SCANNER_ERROR: {
              target: '.done',
              actions: assign({ error: (_, { error }) => error }),
            },
          },
          initial: 'waitingForPaper',
          states: {
            waitingForPaper: {
              invoke: {
                src: async () => {
                  const electionRecord = store.getElectionRecord();
                  const bitonalThreshold = store.getBitonalThreshold();
                  const paperLengthInches = ballotPaperDimensions(
                    electionRecord?.electionDefinition.election.ballotLayout
                      .paperSize ??
                      // If the scanner isn't configured, set the paper length
                      // limit to the longest paper length so any paper will work
                      HmpbBallotPaperSize.Custom22
                  ).height;
                  (
                    await scannerClient.enableScanning({
                      bitonalThreshold,
                      doubleFeedDetectionEnabled: false,
                      paperLengthInches,
                    })
                  ).unsafeUnwrap();
                },
              },
              on: {
                SCANNER_EVENT: [
                  {
                    cond: (_, { event }) => event.event === 'scanStart',
                    target: 'scanning',
                  },
                ],
              },
            },
            scanning: {
              on: {
                SCANNER_EVENT: {
                  cond: (_, { event }) => event.event === 'scanComplete',
                  target: 'runningDiagnostic',
                  actions: assign({
                    scanImages: (_, { event }) => {
                      assert(event.event === 'scanComplete');
                      return event.images;
                    },
                  }),
                },
              },
              exit: async () => {
                (await scannerClient.ejectDocument('toFront')).unsafeUnwrap();
              },
            },
            runningDiagnostic: {
              invoke: {
                src: ({ scanImages }) =>
                  runScannerDiagnostic(workspace, assertDefined(scanImages)),
                onDone: {
                  actions: assign({
                    error: (_, { data }) =>
                      !data
                        ? new PrecinctScannerError('scanner_diagnostic_failed')
                        : undefined,
                  }),
                  target: 'done',
                },
              },
            },
            done: {
              entry: ({ error }) =>
                store.addDiagnosticRecord({
                  type: 'blank-sheet-scan',
                  outcome: error ? 'fail' : 'pass',
                }),
              on: {
                END_SCANNER_DIAGNOSTIC: '#paused',
              },
              exit: assign({ error: undefined }),
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
  logger: Logger
) {
  machineService
    .onEvent(async (event) => {
      const eventString = JSON.stringify(event, cleanLogData);
      if (isEventUserAction(event)) {
        // This event was triggered by a user so we should log as a current user role, falling back to 'cardless_voter' if there is no one authenticated.
        await logger.logAsCurrentRole(
          LogEventId.ScannerEvent,
          { message: `Event: ${event.type}`, eventObject: eventString },
          /* istanbul ignore next - @preserve */
          () => debug(`Event: ${eventString}`),
          'cardless_voter'
        );
      } else {
        // Non-user driven events can be logged with a user of 'system'
        logger.log(
          LogEventId.ScannerEvent,
          'system',
          { message: `Event: ${event.type}`, eventObject: eventString },
          () => debug(`Event: ${eventString}`)
        );
      }
    })
    .onChange((context, previousContext) => {
      /* istanbul ignore next - @preserve */
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
 * Creates the state machine for the precinct scanner.
 *
 * The machine tracks the state of the precinct scanner app, which adds a layer
 * of logic for scanning and interpreting ballots on top of the PDI scanner
 * API (which is the source of truth for the actual hardware state).
 *
 * The machine transitions between states in response to commands (e.g. ACCEPT
 * or RETURN) as well as in response to the paper status events from the scanner
 * (e.g. paper inserted).
 *
 * It's implemented using XState (https://xstate.js.org/docs/).
 */
export function createPrecinctScannerStateMachine({
  scannerClient,
  workspace,
  usbDrive,
  auth,
  logger,
  clock,
}: {
  scannerClient: ScannerClient;
  workspace: Workspace;
  usbDrive: UsbDrive;
  auth: InsertedSmartCardAuthApi;
  logger: Logger;
  clock?: Clock;
}): PrecinctScannerStateMachine {
  const machine = buildMachine({
    scannerClient,
    workspace,
    usbDrive,
    auth,
    logger,
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
          case state.matches('connecting'):
          case state.matches('checkingInitialStatus'):
            return 'connecting';
          case state.matches('disconnected'):
            return 'disconnected';
          case state.matches('waitingForBallot'):
            return 'no_paper';
          case state.matches('paused'):
            return 'paused';
          case state.matches('scanning'):
          case state.matches('interpreting'):
            return 'scanning';
          case state.matches('accepting.paperInFront'):
          case state.matches('acceptingAfterReview.paperInFront'):
            return 'both_sides_have_paper';
          /* istanbul ignore next - state transitions too quickly to test - @preserve */
          case state.matches('readyToAccept'):
          case state.matches('accepting'):
            return 'accepting';
          case state.matches('accepted'):
            return 'accepted';
          case state.matches('needsReview'):
            return 'needs_review';
          case state.matches('acceptingAfterReview'):
            return 'accepting_after_review';
          case state.matches('returning'):
            return 'returning';
          case state.matches('returned'):
            return 'returned';
          case state.matches('rejecting'):
            return 'rejecting';
          case state.matches('rejected'):
            return 'rejected';
          case state.matches('jammed'):
            return 'jammed';
          case state.matches('coverOpen'):
            return 'cover_open';
          /* istanbul ignore next - state transitions too quickly to test - @preserve */
          case state.matches('error'):
          case state.matches('unrecoverableError'):
            return 'unrecoverable_error';
          case state.matches('calibratingDoubleFeedDetection.doubleSheet'):
            return 'calibrating_double_feed_detection.double_sheet';
          case state.matches('calibratingDoubleFeedDetection.singleSheet'):
            return 'calibrating_double_feed_detection.single_sheet';
          case state.matches('calibratingDoubleFeedDetection.done'):
            return 'calibrating_double_feed_detection.done';
          case state.matches('calibratingImageSensors.calibrating'):
            return 'calibrating_image_sensors.calibrating';
          case state.matches('calibratingImageSensors.done'):
            return 'calibrating_image_sensors.done';
          case state.matches('shoeshineModeRescanningBallot'):
            return 'accepted';
          case state.matches('scannerDiagnostic.done'):
            return 'scanner_diagnostic.done';
          case state.matches('scannerDiagnostic'):
            return 'scanner_diagnostic.running';
          /* istanbul ignore next - @preserve */
          default:
            throw new Error(`Unexpected state: ${state.value}`);
        }
      })();

      const { interpretation, error } = state.context;

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
          /* istanbul ignore next - @preserve */
          default:
            return throwIllegalValue(interpretation, 'type');
        }
      })();

      const stateNeedsErrorDetails = [
        'rejecting',
        'rejected',
        'jammed',
        'calibrating_double_feed_detection.done',
        'calibrating_image_sensors.done',
        'scanner_diagnostic.done',
      ].includes(scannerState);
      const errorDetails =
        error && stateNeedsErrorDetails
          ? error instanceof PrecinctScannerError
            ? error.type
            : 'client_error'
          : undefined;
      return {
        state: scannerState,
        interpretation: interpretationResult,
        error: errorDetails,
      };
    },

    accept: () => {
      /* istanbul ignore next - @preserve */
      scanAndInterpretTimer?.checkpoint('ACCEPT');
      machineService.send('ACCEPT');
    },

    return: () => {
      /* istanbul ignore next - @preserve */
      scanAndInterpretTimer?.checkpoint('RETURN');
      machineService.send('RETURN');
    },

    readyForNextBallot: () => {
      machineService.send('READY_FOR_NEXT_BALLOT');
    },

    beginDoubleFeedCalibration: () => {
      machineService.send('BEGIN_DOUBLE_FEED_CALIBRATION');
    },

    endDoubleFeedCalibration: () => {
      machineService.send('END_DOUBLE_FEED_CALIBRATION');
    },

    beginImageSensorCalibration: () => {
      machineService.send('BEGIN_IMAGE_SENSOR_CALIBRATION');
    },

    endImageSensorCalibration: () => {
      machineService.send('END_IMAGE_SENSOR_CALIBRATION');
    },

    beginScannerDiagnostic: () => {
      machineService.send('BEGIN_SCANNER_DIAGNOSTIC');
    },

    endScannerDiagnostic: () => {
      machineService.send('END_SCANNER_DIAGNOSTIC');
    },

    stop: () => {
      machineService.stop();
    },
  };
}
