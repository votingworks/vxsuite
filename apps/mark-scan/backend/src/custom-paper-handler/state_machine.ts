/* eslint-disable @typescript-eslint/no-explicit-any */
import makeDebug from 'debug';
import HID from 'node-hid';
import {
  PaperHandlerDriver,
  PaperHandlerStatus,
  PaperHandlerDriverInterface,
} from '@votingworks/custom-paper-handler';
import {
  assign as xassign,
  BaseActionObject,
  createMachine,
  InvokeConfig,
  StateMachine,
  interpret,
  Interpreter,
  Assigner,
  PropertyAssigner,
  ServiceMap,
  StateSchema,
} from 'xstate';
import { Buffer } from 'buffer';
import { switchMap, throwError, timeout, timer } from 'rxjs';
import { Optional, assert, assertDefined } from '@votingworks/basics';
import { SheetOf } from '@votingworks/types';
import {
  InterpretFileResult,
  interpretSheet,
} from '@votingworks/ballot-interpreter';
import { LogEventId, LogLine, Logger } from '@votingworks/logging';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import {
  BooleanEnvironmentVariableName,
  isCardlessVoterAuth,
  isFeatureFlagEnabled,
  isPollWorkerAuth,
} from '@votingworks/utils';
import { Workspace, constructAuthMachineState } from '../util/workspace';
import { SimpleServerStatus } from './types';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  AUTH_STATUS_POLLING_TIMEOUT_MS,
  DELAY_BEFORE_DECLARING_REAR_JAM_MS,
  DEVICE_STATUS_POLLING_INTERVAL_MS,
  DEVICE_STATUS_POLLING_TIMEOUT_MS,
  MAX_BALLOT_BOX_CAPACITY,
  RESET_AFTER_JAM_DELAY_MS,
  SUCCESS_NOTIFICATION_DURATION_MS,
} from './constants';
import {
  isPaperInScanner,
  isPaperReadyToLoad,
  isPaperInOutput,
  scanAndSave,
  setDefaults,
  printBallot as driverPrintBallot,
  isPaperAnywhere,
  isPaperJammed,
  isPaperInInput,
  resetAndReconnect,
  loadAndParkPaper,
  getSampleBallotFilepaths,
} from './application_driver';
import { PatConnectionStatusReader } from '../pat-input/connection_status_reader';
import {
  ORIGIN_SWIFTY_PRODUCT_ID,
  ORIGIN_VENDOR_ID,
} from '../pat-input/constants';

interface Context {
  auth: InsertedSmartCardAuthApi;
  workspace: Workspace;
  driver: PaperHandlerDriver;
  patConnectionStatusReader: PatConnectionStatusReader;
  devicePollingIntervalMs: number;
  authPollingIntervalMs: number;
  scannedImagePaths?: SheetOf<string>;
  isPatDeviceConnected: boolean;
  interpretation?: SheetOf<InterpretFileResult>;
}

function assign(arg: Assigner<Context, any> | PropertyAssigner<Context, any>) {
  return xassign<Context, any>(arg);
}

type PaperHandlerStatusEvent =
  | { type: 'UNHANDLED_EVENT' }
  | { type: 'NO_PAPER_ANYWHERE' }
  | { type: 'PAPER_JAM' }
  | { type: 'JAMMED_STATUS_NO_PAPER' }
  // Frontend has indicated hardware should try to look for and load paper
  | { type: 'BEGIN_ACCEPTING_PAPER' }
  // Hardware sensors detected paper in front input
  | { type: 'PAPER_READY_TO_LOAD' }
  | { type: 'PAPER_PARKED' }
  | { type: 'PAPER_INSIDE_NO_JAM' }
  | { type: 'VOTER_INITIATED_PRINT'; pdfData: Buffer }
  | { type: 'PAPER_IN_OUTPUT' }
  | { type: 'PAPER_IN_INPUT' }
  | { type: 'POLL_WORKER_CONFIRMED_INVALIDATED_BALLOT' }
  | { type: 'SCANNING' }
  | { type: 'SET_INTERPRETATION_FIXTURE' }
  | { type: 'VOTER_VALIDATED_BALLOT' }
  | { type: 'VOTER_INVALIDATED_BALLOT' }
  | { type: 'AUTH_STATUS_CARDLESS_VOTER' }
  | { type: 'AUTH_STATUS_POLL_WORKER' }
  | { type: 'AUTH_STATUS_UNHANDLED' }
  | { type: 'PAT_DEVICE_CONNECTED' }
  | { type: 'PAT_DEVICE_DISCONNECTED' }
  | { type: 'VOTER_CONFIRMED_PAT_DEVICE_CALIBRATION' }
  | { type: 'PAT_DEVICE_NO_STATUS_CHANGE' }
  | { type: 'PAT_DEVICE_STATUS_UNHANDLED' }
  | { type: 'POLL_WORKER_CONFIRMED_BALLOT_BOX_EMPTIED' };

const debug = makeDebug('mark-scan:state-machine');
const debugEvents = debug.extend('events');

export interface PaperHandlerStateMachine {
  cleanUp(): Promise<void>;
  getRawDeviceStatus(): Promise<PaperHandlerStatus>;
  getSimpleStatus(): SimpleServerStatus;
  setAcceptingPaper(): void;
  printBallot(pdfData: Buffer): void;
  getInterpretation(): Optional<SheetOf<InterpretFileResult>>;
  validateBallot(): void;
  invalidateBallot(): void;
  confirmInvalidateBallot(): void;
  confirmBallotBoxEmptied(): void;
  setPatDeviceIsCalibrated(): void;
  setInterpretationFixture(): void;
}

function paperHandlerStatusToEvent(
  paperHandlerStatus: PaperHandlerStatus
): PaperHandlerStatusEvent {
  if (isPaperJammed(paperHandlerStatus)) {
    if (!isPaperAnywhere(paperHandlerStatus)) {
      // This state is expected when a jam is physically cleared
      // but we haven't issued the reset command yet
      return { type: 'JAMMED_STATUS_NO_PAPER' };
    }

    return { type: 'PAPER_JAM' };
  }

  if (isPaperInOutput(paperHandlerStatus)) {
    return { type: 'PAPER_IN_OUTPUT' };
  }

  if (isPaperInScanner(paperHandlerStatus)) {
    if (paperHandlerStatus.parkSensor) {
      return { type: 'PAPER_PARKED' };
    }

    return { type: 'PAPER_INSIDE_NO_JAM' };
  }
  if (isPaperReadyToLoad(paperHandlerStatus)) {
    return { type: 'PAPER_READY_TO_LOAD' };
  }

  if (isPaperInInput(paperHandlerStatus)) {
    return { type: 'PAPER_IN_INPUT' };
  }

  if (!isPaperAnywhere(paperHandlerStatus)) {
    return { type: 'NO_PAPER_ANYWHERE' };
  }

  return { type: 'UNHANDLED_EVENT' };
}

/**
 * Builds an observable that polls paper status and emits state machine events.
 * Notes:
 * Why Observable? This section from the xstate docs matches our use case closely:
 * https://xstate.js.org/docs/guides/communication.html#invoking-observables
 * "Observables can be invoked, which is expected to send events (strings or objects) to the parent machine,
 * yet not receive events (uni-directional). An observable invocation is a function that takes context and
 * event as arguments and returns an observable stream of events."
 */
function buildPaperStatusObservable() {
  return ({ driver, devicePollingIntervalMs }: Context) => {
    // `timer` returns an Observable that emits values with `pollingInterval` delay between each event
    return (
      timer(0, devicePollingIntervalMs)
        // `pipe` forwards the value from the previous function to the next unary function ie. switchMap.
        // In this case there is no value. The combination of timer(...).pipe() is so we can execute the
        // function supplied to `switchMap` on the specified interval.
        .pipe(
          // `switchMap` returns an Observable that emits events.
          switchMap(async () => {
            // Get raw status, map to event, and emit event
            try {
              const paperHandlerStatus = await driver.getPaperHandlerStatus();
              const event = paperHandlerStatusToEvent(paperHandlerStatus);
              debug(`Emitting event ${event.type}`);
              if (event.type === 'UNHANDLED_EVENT') {
                debug('Unhandled status:\n%O', paperHandlerStatus);
              }
              return event;
            } catch (err) {
              debug('Error in observable: %O', err);
              return { type: 'UNHANDLED_EVENT' };
            }
          }),
          timeout({
            each: DEVICE_STATUS_POLLING_TIMEOUT_MS,
            with: () => throwError(() => new Error('paper_status_timed_out')),
          })
        )
    );
  };
}

function pollPaperStatus(): InvokeConfig<Context, PaperHandlerStatusEvent> {
  return {
    id: 'pollPaperStatus',
    src: buildPaperStatusObservable(),
  };
}

function buildAuthStatusObservable() {
  return ({ auth, authPollingIntervalMs, workspace }: Context) => {
    return timer(0, authPollingIntervalMs).pipe(
      switchMap(async () => {
        try {
          const authStatus = await auth.getAuthStatus(
            constructAuthMachineState(workspace)
          );
          if (isCardlessVoterAuth(authStatus)) {
            return { type: 'AUTH_STATUS_CARDLESS_VOTER' };
          }
          if (isPollWorkerAuth(authStatus)) {
            return { type: 'AUTH_STATUS_POLL_WORKER' };
          }

          debug('Unhandled auth status in observable: %O', authStatus);
          return { type: 'AUTH_STATUS_UNHANDLED' };
        } catch (err) {
          debug('Error in auth observable: %O', err);
          return { type: 'AUTH_STATUS_UNHANDLED' };
        }
      }),
      timeout({
        each: AUTH_STATUS_POLLING_TIMEOUT_MS,
        with: () => throwError(() => new Error('auth_status_timed_out')),
      })
    );
  };
}

function pollAuthStatus(): InvokeConfig<Context, PaperHandlerStatusEvent> {
  return {
    id: 'pollAuthStatus',
    src: buildAuthStatusObservable(),
  };
}

// Finds the Origin Swifty PAT input converter or returns an empty Promise.
// This is a Promise because Observable's switchMap gives a type error if it's not.
function findUsbPatDevice(): Promise<HID.HID | void> {
  // `new HID.HID(vendorId, productId)` throws if device is not found.
  // Listing devices first avoids hard failure.
  const devices = HID.devices();
  const patUsbAdapterInfo = devices.find(
    (device) =>
      device.productId === ORIGIN_SWIFTY_PRODUCT_ID &&
      device.vendorId === ORIGIN_VENDOR_ID
  );

  if (!patUsbAdapterInfo || !patUsbAdapterInfo.path) {
    return Promise.resolve();
  }

  return Promise.resolve(new HID.HID(patUsbAdapterInfo.path));
}

function buildPatDeviceConnectionStatusObservable() {
  return ({
    devicePollingIntervalMs,
    patConnectionStatusReader,
    isPatDeviceConnected: oldConnectionStatus,
  }: Context) => {
    return timer(0, devicePollingIntervalMs).pipe(
      switchMap(async () => {
        try {
          // Checks for a PAT device connected to the built-in PAT jack first. If no device found,
          // checks for a device connected through the Origin Swifty USB switch. We support the Swifty
          // for development only and should be open to deprecating support if the cost of maintaining
          // Swifty support is too high.
          let newConnectionStatus =
            await patConnectionStatusReader.isPatDeviceConnected();

          if (!newConnectionStatus) {
            const currentUsbPatDevice = await findUsbPatDevice();
            newConnectionStatus = !!currentUsbPatDevice;
          }

          if (oldConnectionStatus && !newConnectionStatus) {
            return { type: 'PAT_DEVICE_DISCONNECTED' };
          }

          if (!oldConnectionStatus && newConnectionStatus) {
            return { type: 'PAT_DEVICE_CONNECTED' };
          }

          return { type: 'PAT_DEVICE_NO_STATUS_CHANGE' };
        } catch (err) {
          debug('Error in PAT device observable: %O', err);
          return { type: 'PAT_DEVICE_STATUS_UNHANDLED' };
        }
      }),
      timeout({
        each: DEVICE_STATUS_POLLING_TIMEOUT_MS,
        with: () =>
          throwError(() => new Error('pat_device_connection_status_timed_out')),
      })
    );
  };
}

function pollPatDeviceConnectionStatus(): InvokeConfig<
  Context,
  PaperHandlerStatusEvent
> {
  return {
    id: 'pollPatDeviceConnectionStatus',
    src: buildPatDeviceConnectionStatusObservable(),
  };
}

function loadMetadataAndInterpretBallot(
  context: Context
): Promise<SheetOf<InterpretFileResult>> {
  const { scannedImagePaths, workspace } = context;
  assert(scannedImagePaths, 'Expected scannedImagePaths in context');

  const { store } = workspace;
  const electionDefinition = store.getElectionDefinition();
  assert(
    electionDefinition,
    'Expected electionDefinition to be defined in store'
  );

  const precinctSelection = store.getPrecinctSelection();
  assert(
    precinctSelection,
    'Expected precinctSelection to be defined in store'
  );

  const { markThresholds, precinctScanAdjudicationReasons } = assertDefined(
    store.getSystemSettings()
  );

  return interpretSheet(
    {
      electionDefinition,
      precinctSelection,
      testMode: store.getTestMode(),
      markThresholds,
      adjudicationReasons: precinctScanAdjudicationReasons,
    },
    scannedImagePaths
  );
}

export function buildMachine(
  initialContext: Context,
  auth: InsertedSmartCardAuthApi,
  logger: Logger
): StateMachine<
  Context,
  StateSchema,
  PaperHandlerStatusEvent,
  any,
  BaseActionObject,
  ServiceMap
> {
  return createMachine({
    schema: {
      /* eslint-disable-next-line vx/gts-object-literal-types */
      context: {} as Context,
      /* eslint-disable-next-line vx/gts-object-literal-types */
      events: {} as PaperHandlerStatusEvent,
    },
    id: 'bmd',
    initial: 'voting_flow',
    context: initialContext,
    on: {
      PAPER_JAM: 'voting_flow.jammed',
      JAMMED_STATUS_NO_PAPER: 'voting_flow.jam_physically_cleared',
      PAT_DEVICE_CONNECTED: {
        // Performing the assign here ensures the PAT device observable will
        // have an updated value for isPatDeviceConnected
        actions: assign({
          isPatDeviceConnected: true,
        }),
        target: 'pat_device_connected',
      },
      PAT_DEVICE_DISCONNECTED: {
        // Performing the assign here ensures the PAT device observable will
        // have an updated value for isPatDeviceConnected
        actions: assign({
          isPatDeviceConnected: false,
        }),
        target: 'pat_device_disconnected',
      },
      SET_INTERPRETATION_FIXTURE: {
        actions: assign({
          scannedImagePaths: getSampleBallotFilepaths(),
        }),
        target: 'voting_flow.interpreting',
      },
    },
    invoke: [pollPatDeviceConnectionStatus()],
    states: {
      voting_flow: {
        initial: 'not_accepting_paper',
        states: {
          history: {
            type: 'history',
            history: 'shallow',
          },
          // Initial state. Doesn't accept paper and transitions away when the frontend says it's ready to accept
          not_accepting_paper: {
            invoke: pollPaperStatus(),
            on: {
              // Paper may be inside the machine from previous testing or machine failure. We should eject
              // the paper (not to ballot bin) because we don't know whether the page has been printed.
              PAPER_INSIDE_NO_JAM: 'eject_to_front',
              PAPER_PARKED: 'eject_to_front',
              BEGIN_ACCEPTING_PAPER: 'accepting_paper',
            },
          },
          accepting_paper: {
            invoke: pollPaperStatus(),
            on: {
              PAPER_READY_TO_LOAD: 'loading_paper',
              PAPER_PARKED: 'waiting_for_ballot_data',
            },
          },
          loading_paper: {
            invoke: [
              pollPaperStatus(),
              {
                id: 'loadAndPark',
                src: (context) => {
                  return loadAndParkPaper(context.driver);
                },
              },
            ],
            on: {
              PAPER_PARKED: 'waiting_for_ballot_data',
              NO_PAPER_ANYWHERE: 'accepting_paper',
            },
          },
          waiting_for_ballot_data: {
            on: {
              VOTER_INITIATED_PRINT: 'printing_ballot',
            },
          },
          printing_ballot: {
            invoke: [
              {
                id: 'printBallot',
                src: (context, event) => {
                  assert(event.type === 'VOTER_INITIATED_PRINT');
                  return driverPrintBallot(context.driver, event.pdfData, {});
                },
                onDone: 'scanning',
              },
              pollPaperStatus(),
            ],
          },
          scanning: {
            invoke: [
              {
                id: 'scanAndSave',
                src: (context) => {
                  return scanAndSave(context.driver);
                },
                onDone: {
                  target: 'interpreting',
                  actions: assign({
                    scannedImagePaths: (_, event) => event.data,
                  }),
                },
              },
              pollPaperStatus(),
            ],
          },
          interpreting: {
            // Paper is in the paper handler for the duration of the interpreting stage and paper handler
            // motors are never moved, so we don't need to poll paper status or handle jams.
            invoke: {
              id: 'interpretScannedBallot',
              src: loadMetadataAndInterpretBallot,
              onDone: {
                target: 'transition_interpretation',
                actions: assign({
                  interpretation: (_, event) => event.data,
                }),
              },
            },
          },
          // Intermediate state to conditionally transition based on ballot interpretation
          transition_interpretation: {
            entry: (context) => {
              const interpretationType = assertDefined(
                context.interpretation
              )[0].interpretation.type;
              assert(
                interpretationType === 'InterpretedBmdPage' ||
                  interpretationType === 'BlankPage',
                `Unexpected interpretation type: ${interpretationType}`
              );
            },
            always: [
              {
                target: 'presenting_ballot',
                cond: (context) =>
                  // context.interpretation is already asserted in the entry function but Typescript is unaware
                  assertDefined(context.interpretation)[0].interpretation
                    .type === 'InterpretedBmdPage',
              },
              {
                target: 'blank_page_interpretation',
                cond: (context) =>
                  assertDefined(context.interpretation)[0].interpretation
                    .type === 'BlankPage',
              },
            ],
          },
          blank_page_interpretation: {
            invoke: pollPaperStatus(),
            initial: 'presenting_paper',
            // These nested states differ slightly from the top-level paper load states so we can't reuse the latter.
            states: {
              presenting_paper: {
                // Heavier paper can fail to eject completely and trigger a jam state even though the paper isn't physically jammed.
                // To work around this, we avoid ejecting to front. Instead, we present the paper so it's held by the device in a
                // stable non-jam state. We instruct the poll worker to remove the paper directly from the 'presenting' state.
                entry: async (context) => {
                  await logger.log(LogEventId.BlankInterpretation, 'system');
                  await context.driver.presentPaper();
                },
                on: { NO_PAPER_ANYWHERE: 'accepting_paper' },
              },
              accepting_paper: {
                on: {
                  PAPER_READY_TO_LOAD: 'load_paper',
                },
              },
              load_paper: {
                entry: async (context) => {
                  await context.driver.loadPaper();
                  await context.driver.parkPaper();
                },
                on: {
                  PAPER_PARKED: {
                    target: 'done',
                    actions: () => {
                      assign({
                        interpretation: undefined,
                        scannedImagePaths: undefined,
                      });
                    },
                  },
                  NO_PAPER_ANYWHERE: 'accepting_paper',
                },
              },
              done: {
                type: 'final',
              },
            },
            onDone: 'paper_reloaded',
          },
          // `paper_reloaded` could be a substate of `blank_page_interpretation` but by keeping
          // them separate we can avoid exposing all the substates of `blank_page_interpretation`
          // to the frontend.
          paper_reloaded: {
            invoke: pollAuthStatus(),
            on: {
              AUTH_STATUS_CARDLESS_VOTER: 'waiting_for_ballot_data',
            },
          },
          presenting_ballot: {
            invoke: pollPaperStatus(),
            entry: async (context) => {
              await context.driver.presentPaper();
            },
            on: {
              VOTER_VALIDATED_BALLOT: 'eject_to_rear',
              VOTER_INVALIDATED_BALLOT:
                'waiting_for_invalidated_ballot_confirmation',
              NO_PAPER_ANYWHERE: {
                cond: () =>
                  !isFeatureFlagEnabled(
                    BooleanEnvironmentVariableName.SKIP_PAPER_HANDLER_HARDWARE_CHECK
                  ),
                target: 'resetting_state_machine_after_success',
              },
            },
          },
          waiting_for_invalidated_ballot_confirmation: {
            initial: 'paper_present',
            states: {
              paper_present: {
                invoke: pollPaperStatus(),
                on: {
                  NO_PAPER_ANYWHERE: 'paper_absent',
                },
              },
              paper_absent: {
                on: {
                  POLL_WORKER_CONFIRMED_INVALIDATED_BALLOT: 'done',
                },
              },
              done: {
                type: 'final',
              },
            },
            onDone: 'accepting_paper',
          },
          // Eject-to-rear jam handling is a little clunky. It
          // 1. Tries to transition to success if no paper is detected
          // 2. If after a timeout we have not transitioned away (because paper still present), transition to jammed state
          // 3. Jam detection state transitions to jam reset state once it confirms no paper present
          eject_to_rear: {
            invoke: pollPaperStatus(),
            entry: async (context) => {
              if (
                isFeatureFlagEnabled(
                  BooleanEnvironmentVariableName.SKIP_PAPER_HANDLER_HARDWARE_CHECK
                )
              ) {
                return;
              }

              await context.driver.parkPaper();
              await context.driver.ejectBallotToRear();
            },
            on: {
              NO_PAPER_ANYWHERE: 'ballot_accepted',
              PAPER_JAM: 'jammed',
            },
            after: {
              [DELAY_BEFORE_DECLARING_REAR_JAM_MS]: 'jammed',
            },
          },
          ballot_accepted: {
            entry: (context) => {
              const { store } = context.workspace;
              context.workspace.store.setBallotsCastSinceLastBoxChange(
                store.getBallotsCastSinceLastBoxChange() + 1
              );
            },
            after: {
              [SUCCESS_NOTIFICATION_DURATION_MS]:
                'resetting_state_machine_after_success',
            },
          },
          eject_to_front: {
            invoke: pollPaperStatus(),
            entry: async (context) => {
              await context.driver.ejectPaperToFront();
            },
            on: {
              NO_PAPER_ANYWHERE: 'resetting_state_machine_after_success',
            },
          },
          jammed: {
            invoke: pollPaperStatus(),
            on: {
              NO_PAPER_ANYWHERE: 'jam_physically_cleared',
            },
          },
          jam_physically_cleared: {
            invoke: {
              id: 'resetScanAndDriver',
              src: (context) => {
                // Issues `reset scan` command, creates a new WebUSBDevice, and reconnects
                return resetAndReconnect(context.driver);
              },
              onDone: {
                target: 'resetting_state_machine_after_jam',
                actions: assign({
                  // Overwrites the old nonfunctional driver in context with the new functional one
                  driver: (_, event) => event.data,
                }),
              },
            },
          },
          resetting_state_machine_after_jam: {
            entry: async (context) => {
              await auth.endCardlessVoterSession(
                constructAuthMachineState(context.workspace)
              );

              assign({
                interpretation: undefined,
                scannedImagePaths: undefined,
                isPatDeviceConnected: false,
              });
            },
            after: {
              // The frontend needs time to idle in this state so the user can read the status message
              [RESET_AFTER_JAM_DELAY_MS]: 'not_accepting_paper',
            },
          },
          resetting_state_machine_after_success: {
            entry: async (context) => {
              await auth.endCardlessVoterSession(
                constructAuthMachineState(context.workspace)
              );

              assign({
                interpretation: undefined,
                scannedImagePaths: undefined,
                isPatDeviceConnected: false,
              });
            },
            always: [
              {
                target: 'empty_ballot_box',
                cond: (context) =>
                  context.workspace.store.getBallotsCastSinceLastBoxChange() >=
                  MAX_BALLOT_BOX_CAPACITY,
              },
              { target: 'not_accepting_paper' },
            ],
          },
          // The flow to empty a full ballot box. Can only occur at the end of a voting session.
          empty_ballot_box: {
            on: {
              POLL_WORKER_CONFIRMED_BALLOT_BOX_EMPTIED: 'not_accepting_paper',
            },
          },
        },
      },
      pat_device_disconnected: {
        always: 'voting_flow.history',
      },
      pat_device_connected: {
        on: {
          VOTER_CONFIRMED_PAT_DEVICE_CALIBRATION: 'voting_flow.history',
          PAT_DEVICE_DISCONNECTED: 'pat_device_disconnected',
          PAT_DEVICE_CONNECTED: undefined,
        },
      },
    },
  });
}

function setUpLogging(
  machineService: Interpreter<Context, any, PaperHandlerStatusEvent, any, any>,
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
        // behavior, since others would be too verbose (e.g. paper-handler client
        // object)
        .filter(([key]) =>
          [
            'pollingIntervalMs',
            'scannedImagePaths',
            'interpretation',
            'patDevice',
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
        LogEventId.PaperHandlerStateChanged,
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
        LogEventId.PaperHandlerStateChanged,
        'system',
        { message: `Transitioned to: ${JSON.stringify(state.value)}` },
        (logLine: LogLine) => debug(logLine.message)
      );
    });
}

export async function getPaperHandlerStateMachine({
  workspace,
  auth,
  logger,
  driver,
  patConnectionStatusReader,
  devicePollingIntervalMs = DEVICE_STATUS_POLLING_INTERVAL_MS,
  authPollingIntervalMs = AUTH_STATUS_POLLING_INTERVAL_MS,
}: {
  workspace: Workspace;
  auth: InsertedSmartCardAuthApi;
  logger: Logger;
  driver: PaperHandlerDriverInterface;
  patConnectionStatusReader: PatConnectionStatusReader;
  devicePollingIntervalMs: number;
  authPollingIntervalMs: number;
}): Promise<Optional<PaperHandlerStateMachine>> {
  const initialContext: Context = {
    auth,
    workspace,
    driver,
    isPatDeviceConnected: false,
    patConnectionStatusReader,
    devicePollingIntervalMs,
    authPollingIntervalMs,
  };

  const machine = buildMachine(initialContext, auth, logger);
  const machineService = interpret(machine).start();
  setUpLogging(machineService, logger);
  await setDefaults(driver);

  return {
    async cleanUp(): Promise<void> {
      machineService.stop();
      await driver.disconnect();
    },

    getRawDeviceStatus(): Promise<PaperHandlerStatus> {
      return driver.getPaperHandlerStatus();
    },

    getSimpleStatus(): SimpleServerStatus {
      const { state } = machineService;

      switch (true) {
        case state.matches('voting_flow.not_accepting_paper'):
          return 'not_accepting_paper';
        case state.matches('voting_flow.accepting_paper'):
          return 'accepting_paper';
        case state.matches('voting_flow.loading_paper'):
          return 'loading_paper';
        case state.matches('voting_flow.waiting_for_ballot_data'):
          return 'waiting_for_ballot_data';
        case state.matches('voting_flow.printing_ballot'):
          return 'printing_ballot';
        case state.matches('voting_flow.scanning'):
          return 'scanning';
        case state.matches('voting_flow.interpreting'):
          return 'interpreting';
        case state.matches(
          'voting_flow.waiting_for_invalidated_ballot_confirmation.paper_present'
        ):
          return 'waiting_for_invalidated_ballot_confirmation.paper_present';
        case state.matches(
          'voting_flow.waiting_for_invalidated_ballot_confirmation.paper_absent'
        ):
          return 'waiting_for_invalidated_ballot_confirmation.paper_absent';
        case state.matches('voting_flow.presenting_ballot'):
          return 'presenting_ballot';
        case state.matches('voting_flow.eject_to_front'):
          return 'ejecting_to_front';
        case state.matches('voting_flow.eject_to_rear'):
          return 'ejecting_to_rear';
        case state.matches('voting_flow.jammed'):
          return 'jammed';
        case state.matches('voting_flow.jam_physically_cleared'):
          return 'jam_cleared';
        case state.matches('voting_flow.resetting_state_machine_after_jam'):
          return 'resetting_state_machine_after_jam';
        case state.matches('voting_flow.ballot_accepted'):
          return 'ballot_accepted';
        case state.matches('voting_flow.resetting_state_machine_after_success'):
          return 'resetting_state_machine_after_success';
        case state.matches('voting_flow.empty_ballot_box'):
          return 'empty_ballot_box';
        case state.matches('voting_flow.transition_interpretation'):
          return 'interpreting';
        case state.matches('voting_flow.blank_page_interpretation'):
          // blank_page_interpretation has multiple child states but all are handled the same by the frontend
          return 'blank_page_interpretation';
        case state.matches('voting_flow.paper_reloaded'):
          return 'paper_reloaded';
        case state.matches('pat_device_connected'):
          return 'pat_device_connected';
        default:
          debug('Unhandled state: %O', state.value);
          return 'no_hardware';
      }
    },

    setAcceptingPaper(): void {
      machineService.send({
        type: 'BEGIN_ACCEPTING_PAPER',
      });
    },

    printBallot(pdfData: Buffer): void {
      machineService.send({
        type: 'VOTER_INITIATED_PRINT',
        pdfData,
      });
    },

    setInterpretationFixture(): void {
      machineService.send({
        type: 'SET_INTERPRETATION_FIXTURE',
      });
    },

    getInterpretation(): Optional<SheetOf<InterpretFileResult>> {
      const { state } = machineService;
      const { context } = state;

      debug(
        'Returning interpretation of type:',
        context.interpretation
          ? JSON.stringify(context.interpretation[0].interpretation.type)
          : 'no_interpretation_found'
      );
      return context.interpretation;
    },

    validateBallot(): void {
      machineService.send({
        type: 'VOTER_VALIDATED_BALLOT',
      });
      void logger.log(LogEventId.VoteCast, 'cardless_voter');
    },

    invalidateBallot(): void {
      machineService.send({
        type: 'VOTER_INVALIDATED_BALLOT',
      });

      void logger.log(LogEventId.BallotInvalidated, 'cardless_voter');
    },

    setPatDeviceIsCalibrated(): void {
      machineService.send({
        type: 'VOTER_CONFIRMED_PAT_DEVICE_CALIBRATION',
      });
    },

    confirmInvalidateBallot(): void {
      machineService.send({
        type: 'POLL_WORKER_CONFIRMED_INVALIDATED_BALLOT',
      });
    },

    confirmBallotBoxEmptied(): void {
      machineService.send({
        type: 'POLL_WORKER_CONFIRMED_BALLOT_BOX_EMPTIED',
      });
    },
  };
}
