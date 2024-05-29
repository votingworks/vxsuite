import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import { ImageData } from 'canvas';
import {
  ScannerClient,
  ScannerError,
  ScannerEvent,
  ScannerStatus,
} from '@votingworks/pdi-scanner';
import assert from 'assert';
import {
  ActorRef,
  BaseActionObject,
  Interpreter,
  InvokeConfig,
  StateNodeConfig,
  assign,
  createMachine,
  interpret as interpretStateMachine,
  sendParent,
  spawn,
} from 'xstate';
import { v4 as uuid } from 'uuid';
import {
  SheetInterpretation,
  SheetOf,
  ballotPaperDimensions,
  mapSheet,
} from '@votingworks/types';
import { join } from 'path';
import { writeImageData } from '@votingworks/image-utils';
import { BaseLogger, LogEventId, LogLine } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/usb-drive';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { Clock } from 'xstate/lib/interpreter';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { interpret } from '../../interpret';
import { Workspace } from '../../util/workspace';
import { rootDebug } from '../../util/debug';
import {
  InterpretationResult,
  PrecinctScannerError,
  PrecinctScannerMachineStatus,
  PrecinctScannerStateMachine,
} from '../../types';
import { recordAcceptedSheet, recordRejectedSheet } from '../shared';
import { isReadyToScan } from '../../app_flow';

const debug = rootDebug.extend('state-machine');

async function interpretSheet(
  workspace: Workspace,
  scanImages: SheetOf<ImageData>
): Promise<InterpretationResult> {
  const sheetId = uuid();
  const { store } = workspace;

  // FIXME: we should be able to use the image format directly, but the
  // rest of the system expects file paths instead of image buffers.
  const sheetPrefix = uuid();
  const scanImagePaths = await mapSheet(scanImages, async (image, side) => {
    const { scannedImagesPath } = workspace;
    const path = join(scannedImagesPath, `${sheetPrefix}-${side}.png`);
    await writeImageData(path, image);
    return path;
  });

  const interpretation = (
    await interpret(sheetId, scanImagePaths, {
      electionDefinition: assertDefined(store.getElectionDefinition()),
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

interface Context {
  client: ScannerClient;
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
  | { type: 'SCANNING_ENABLED' }
  | { type: 'SCANNING_DISABLED' }
  | { type: 'BEGIN_DOUBLE_FEED_CALIBRATION' }
  | { type: 'END_DOUBLE_FEED_CALIBRATION' };

export interface Delays {
  /**
   * How often to check that scanning is enabled (i.e. voter auth, ballot bag
   * not full, etc).
   */
  DELAY_SCANNING_ENABLED_POLLING_INTERVAL: number;
  /**
   * Time between calls to get the scanner status.
   */
  DELAY_SCANNER_STATUS_POLLING_INTERVAL: number;
  /**
   * Time to wait after a ballot is accepted before scanning the next one.
   */
  DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT: number;
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
}

export const delays = {
  DELAY_SCANNING_ENABLED_POLLING_INTERVAL: 500,
  DELAY_SCANNER_STATUS_POLLING_INTERVAL: 500,
  DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT: 2_500,
  DELAY_RECONNECT: 500,
  DELAY_SCANNING_TIMEOUT: 5_000,
  DELAY_ACCEPTING_TIMEOUT: 5_000,
} satisfies Delays;

function buildMachine({
  createScannerClient,
  workspace,
  usbDrive,
  auth,
}: {
  createScannerClient: () => ScannerClient;
  workspace: Workspace;
  usbDrive: UsbDrive;
  auth: InsertedSmartCardAuthApi;
}) {
  const { store } = workspace;
  const initialClient = createScannerClient();
  const isShoeshineModeEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_SCAN_SHOESHINE_MODE
  );

  function createPollingChildMachine(
    id: string,
    queryFn: (context: Pick<Context, 'client'>) => Promise<Event>,
    delay: keyof Delays
  ) {
    return createMachine<Pick<Context, 'client'>>(
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
    data: (context) => ({ client: context.client }),
  };

  const pollScannerStatus: InvokeConfig<Context, Event> = {
    src: createPollingChildMachine(
      'pollScannerStatus',
      async ({ client }) => {
        const statusResult = await client.getScannerStatus();
        return statusResult.isOk()
          ? { type: 'SCANNER_STATUS', status: statusResult.ok() }
          : { type: 'SCANNER_ERROR', error: statusResult.err() };
      },
      'DELAY_SCANNER_STATUS_POLLING_INTERVAL'
    ),
    data: (context) => ({ client: context.client }),
  };

  // To ensure we catch scanner events no matter what state the machine is in,
  // we spawn a long-lived actor that is referenced in the context (rather than
  // invoking it in a specific state).
  const listenForScannerEventsAtRoot = assign<Context>({
    rootListenerRef: ({ client }) =>
      spawn((callback) => {
        const listener = client.addListener((event) => {
          callback(
            event.event === 'error'
              ? { type: 'SCANNER_ERROR', error: event }
              : { type: 'SCANNER_EVENT', event }
          );
        });
        return () => client.removeListener(listener);
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
          recordRejectedSheet(workspace, usbDrive, context.interpretation),
        invoke: [
          {
            src: async ({ client }) => {
              (await client.ejectDocument('toFrontAndHold')).unsafeUnwrap();
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
              cond: (_, { status }) => status.documentJam,
              target: '#jammed',
            },
            {
              cond: (_, { status }) => !anyRearSensorCovered(status),
              target: 'ejected',
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
            src: async ({ client }) => {
              (await client.ejectDocument('toRear')).unsafeUnwrap();
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
            {
              cond: (_, { status }) => status.documentJam,
              target: '#rejecting',
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
            target: '#rejecting',
            actions: assign({
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              error: (_context) =>
                new PrecinctScannerError('paper_in_back_after_accept'),
            }),
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

      context: { client: initialClient },

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
          /* c8 ignore start - fallback case, shouldn't happen */
          {
            target: '#error',
            actions: assign({
              error: (_, { event }) =>
                new PrecinctScannerError(
                  'unexpected_event',
                  `Unexpected event: ${event.event}`
                ),
            }),
          },
          /* c8 ignore stop */
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
            src: async ({ client }) => (await client.connect()).unsafeUnwrap(),
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
                    target: '#rejecting',
                    actions: [
                      assign({
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        error: (_context) =>
                          new PrecinctScannerError(
                            'paper_in_back_after_reconnect'
                          ),
                      }),
                    ],
                  },
                  { target: 'waiting' },
                ],
              },
            },
            waiting: {
              invoke: [
                pollScanningEnabled,
                {
                  src: async ({ client }) => {
                    const electionDefinition = store.getElectionDefinition();
                    if (!electionDefinition) return;
                    const paperLengthInches = ballotPaperDimensions(
                      electionDefinition.election.ballotLayout.paperSize
                    ).height;
                    const doubleFeedDetectionEnabled =
                      !store.getIsDoubleFeedDetectionDisabled();
                    (
                      await client.enableScanning({
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
              src: async ({ client }) =>
                (await client.disableScanning()).unsafeUnwrap(),
            },
            pollScanningEnabled,
          ],
          on: {
            SCANNING_ENABLED: 'waitingForBallot',
            BEGIN_DOUBLE_FEED_CALIBRATION: 'calibratingDoubleFeedDetection',
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
                  // A doubleFeedDetected event will always be followed by a
                  // scanFailed event (which indicates that the scan actually
                  // stopped), so we don't transition states yet, just record
                  // that it happened. Otherwise, we'd have a scanFailed event
                  // come in later and be unhandled.
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
                  // This guard was put in during initial development to prevent
                  // against cases where the scanner fails to grab the ballot.
                  // Currently, those cases seem to be yielding a `scanFailed`
                  // event, so we aren't hitting this guard. Nevertheless, it
                  // seems like a good backup, so leaving it here.
                  {
                    cond: (_, { status }) => !status.documentInScanner,
                    target: '#error',
                    /* c8 ignore start */
                    actions: assign({
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      error: (_context) =>
                        new PrecinctScannerError('scanning_failed'),
                    }),
                    /* c8 ignore stop */
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
            src: ({ scanImages }) =>
              interpretSheet(workspace, assertDefined(scanImages)),
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
              target: 'rejecting',
              actions: assign({ error: (_, event) => event.data }),
            },
          },
        },

        readyToAccept: {
          on: { ACCEPT: isShoeshineModeEnabled ? 'accepted' : 'accepting' },
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
          after: {
            // We wait a bit in the accepted state in order to make sure the
            // voter has time to view the success message. In addition, it's
            // important to wait at least 2 seconds before scanning another
            // ballot because there is a limit to how many scan cycles the
            // scanner can perform per minute without overheating and damaging
            // the hardware. This is particularly relevant in shoeshine mode.
            DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT: isShoeshineModeEnabled
              ? 'shoeshineModeRescanningBallot'
              : 'waitingForBallot',
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
                src: async ({ client }) => {
                  (
                    await client.calibrateDoubleFeedDetection('double')
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
                src: async ({ client }) => {
                  (
                    await client.calibrateDoubleFeedDetection('single')
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

        jammed: {
          id: 'jammed',
          invoke: pollScannerStatus,
          on: {
            SCANNER_STATUS: [
              {
                cond: (_, { status }) => !status.documentJam,
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
              src: async ({ client }) => {
                (await client.disableScanning()).unsafeUnwrap();
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
                src: async ({ client }) =>
                  (await client.connect()).unsafeUnwrap(),
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
          initial: 'checkingErrorCode',
          states: {
            checkingErrorCode: {
              always: [
                {
                  cond: (context) =>
                    context.error !== undefined &&
                    'code' in context.error &&
                    context.error.code === 'disconnected',
                  target: '#disconnected',
                },
                { target: 'exiting' },
              ],
            },
            exiting: {
              invoke: {
                src: async ({ client }) => {
                  (await client.exit()).unsafeUnwrap();
                },
                onDone: 'reconnecting',
                onError: 'reconnecting',
              },
              exit: assign({ client: () => createScannerClient() }),
            },
            reconnecting: {
              entry: listenForScannerEventsAtRoot,
              invoke: {
                src: async ({ client }) =>
                  (await client.connect()).unsafeUnwrap(),
                onDone: '#checkingInitialStatus',
                onError: '#unrecoverableError',
              },
            },
          },
        },

        unrecoverableError: { id: 'unrecoverableError' },

        shoeshineModeRescanningBallot: {
          initial: 'rescanning',
          entry: assign({ interpretation: undefined }),
          states: {
            rescanning: {
              invoke: {
                src: async ({ client }) => {
                  (
                    await client.ejectDocument('toFrontAndRescan')
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
  function cleanLogData(key: string, value: unknown): unknown {
    if (value === undefined) {
      return 'undefined';
    }
    if (value instanceof ImageData) {
      return {
        width: value.width,
        height: value.height,
        data: value.data.length,
      };
    }
    if (value instanceof Error) {
      return { ...value, message: value.message, stack: value.stack };
    }
    if (
      [
        // Protect voter privacy
        'markInfo',
        'votes',
        'unmarkedWriteIns',
        'adjudicationInfo',
        'reasons',
        // Hide large values
        'layout',
        'client',
        'rootListenerRef',
      ].includes(key)
    ) {
      return '[hidden]';
    }
    return value;
  }

  machineService
    .onEvent(async (event) => {
      const eventString = JSON.stringify(event, cleanLogData);
      await logger.log(
        LogEventId.ScannerEvent,
        'system',
        { message: `Event: ${event.type}`, eventObject: eventString },
        () => debug(`Event: ${eventString}`)
      );
    })
    .onChange(async (context, previousContext) => {
      /* c8 ignore next */
      if (!previousContext) return;
      const changed = Object.entries(context).filter(
        ([key, value]) => previousContext[key as keyof Context] !== value
      );
      if (changed.length === 0) return;
      const contextString = JSON.stringify(
        Object.fromEntries(changed),
        cleanLogData
      );
      await logger.log(
        LogEventId.ScannerStateChanged,
        'system',
        {
          message: `Context updated`,
          changedFields: contextString,
        },
        () => debug(`Context updated: ${contextString}`)
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
  createScannerClient,
  workspace,
  usbDrive,
  auth,
  logger,
  clock,
}: {
  createScannerClient: () => ScannerClient;
  workspace: Workspace;
  usbDrive: UsbDrive;
  auth: InsertedSmartCardAuthApi;
  logger: BaseLogger;
  clock?: Clock;
}): PrecinctScannerStateMachine {
  const machine = buildMachine({
    createScannerClient,
    workspace,
    usbDrive,
    auth,
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
          case state.matches('readyToAccept'):
            return 'ready_to_accept';
          case state.matches('accepting.paperInFront'):
          case state.matches('acceptingAfterReview.paperInFront'):
            return 'both_sides_have_paper';
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
          case state.matches('error'):
            return 'recovering_from_error';
          case state.matches('unrecoverableError'):
            return 'unrecoverable_error';
          case state.matches('calibratingDoubleFeedDetection.doubleSheet'):
            return 'calibrating_double_feed_detection.double_sheet';
          case state.matches('calibratingDoubleFeedDetection.singleSheet'):
            return 'calibrating_double_feed_detection.single_sheet';
          case state.matches('calibratingDoubleFeedDetection.done'):
            return 'calibrating_double_feed_detection.done';
          case state.matches('shoeshineModeRescanningBallot'):
            return 'accepted';
          /* c8 ignore next 2 */
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
          /* c8 ignore next 2 */
          default:
            return throwIllegalValue(interpretation, 'type');
        }
      })();

      const stateNeedsErrorDetails = [
        'rejecting',
        'rejected',
        'recovering_from_error',
        'calibrating_double_feed_detection.done',
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
      machineService.send('ACCEPT');
    },

    return: () => {
      machineService.send('RETURN');
    },

    beginDoubleFeedCalibration: () => {
      machineService.send('BEGIN_DOUBLE_FEED_CALIBRATION');
    },

    endDoubleFeedCalibration: () => {
      machineService.send('END_DOUBLE_FEED_CALIBRATION');
    },

    stop: () => {
      machineService.stop();
    },
  };
}
