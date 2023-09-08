/* eslint-disable @typescript-eslint/no-explicit-any */
import makeDebug from 'debug';
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
import { Optional, assert, assertDefined, sleep } from '@votingworks/basics';
import { SheetOf } from '@votingworks/types';
import {
  InterpretFileResult,
  interpretSheet,
} from '@votingworks/ballot-interpreter';
import { LogEventId, LogLine, Logger } from '@votingworks/logging';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { isCardlessVoterAuth, isPollWorkerAuth } from '@votingworks/utils';
import { Workspace, constructAuthMachineState } from '../util/workspace';
import { SimpleServerStatus } from './types';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  DELAY_BEFORE_DECLARING_REAR_JAM_MS,
  PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS,
  PAPER_HANDLER_STATUS_POLLING_TIMEOUT_MS,
  RESET_AFTER_JAM_DELAY_MS,
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
} from './application_driver';

interface Context {
  auth: InsertedSmartCardAuthApi;
  workspace: Workspace;
  driver: PaperHandlerDriver;
  devicePollingIntervalMs: number;
  authPollingIntervalMs: number;
  scannedImagePaths?: SheetOf<string>;
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
  | { type: 'VOTER_CONFIRMED_INVALIDATED_BALLOT' }
  | { type: 'SCANNING' }
  | { type: 'VOTER_VALIDATED_BALLOT' }
  | { type: 'VOTER_INVALIDATED_BALLOT' }
  | { type: 'AUTH_STATUS_CARDLESS_VOTER' }
  | { type: 'AUTH_STATUS_POLL_WORKER' }
  | { type: 'AUTH_STATUS_UNHANDLED' };

const debug = makeDebug('mark-scan:state-machine');
const debugEvents = debug.extend('events');

export interface PaperHandlerStateMachine {
  stopMachineService(): void;
  getRawDeviceStatus(): Promise<PaperHandlerStatus>;
  getSimpleStatus(): SimpleServerStatus;
  setAcceptingPaper(): void;
  printBallot(pdfData: Buffer): void;
  getInterpretation(): Optional<SheetOf<InterpretFileResult>>;
  validateBallot(): void;
  invalidateBallot(): void;
  confirmInvalidateBallot(): void;
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
            each: PAPER_HANDLER_STATUS_POLLING_TIMEOUT_MS,
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
          debug('auth status polled');
          if (isCardlessVoterAuth(authStatus)) {
            debug('emit cardless voter auth event');
            return { type: 'AUTH_STATUS_CARDLESS_VOTER' };
          }
          if (isPollWorkerAuth(authStatus)) {
            debug('emit poll worker auth event');
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
        each: PAPER_HANDLER_STATUS_POLLING_TIMEOUT_MS,
        with: () => throwError(() => new Error('paper_status_timed_out')),
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

  // Hardcoded until isLivemode is moved from frontend store to backend store
  const testMode = true;
  const { markThresholds, precinctScanAdjudicationReasons } = assertDefined(
    store.getSystemSettings()
  );

  return interpretSheet(
    {
      electionDefinition,
      precinctSelection,
      testMode,
      markThresholds,
      adjudicationReasons: precinctScanAdjudicationReasons,
    },
    scannedImagePaths
  );
}

export function buildMachine(
  initialContext: Context,
  auth: InsertedSmartCardAuthApi
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
    initial: 'not_accepting_paper',
    context: initialContext,
    on: {
      PAPER_JAM: 'jammed',
      JAMMED_STATUS_NO_PAPER: 'jam_physically_cleared',
    },
    states: {
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
            onDone: {
              target: 'scanning',
            },
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
              actions: assign({ scannedImagePaths: (_, event) => event.data }),
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
        always: [
          {
            target: 'presenting_ballot',
            cond: (context) =>
              context.interpretation
                ? context.interpretation[0].interpretation.type ===
                  'InterpretedBmdPage'
                : false,
          },
          {
            target: 'blank_page_interpretation',
            cond: (context) =>
              context.interpretation
                ? context.interpretation[0].interpretation.type === 'BlankPage'
                : false,
          },
        ],
      },
      blank_page_interpretation: {
        invoke: pollPaperStatus(),
        entry: async (context) => {
          await context.driver.presentPaper();
          await sleep(500);
          await context.driver.ejectPaperToFront();
        },
        initial: '_accepting_paper',
        states: {
          // Reimplement paper load states because the initial paper loading has constraints
          // that 2nd paper load doesn't.
          // e.g. Initial load requires empty ballot state, but 2nd load wants the opposite;
          // voter should be able to return to their ballot state after the paper is reloaded
          _accepting_paper: {
            on: {
              // Due to low force from motors when ejecting to front, paper may still be present
              // in input after front eject. This will trigger transition to _load_paper. Since we can't
              // know for sure if the paper is actually ready to load or if it's just triggering the sensors,
              // we always try to load and return to _accepting_paper if the load failed.
              PAPER_READY_TO_LOAD: '_load_paper',
              // Heavy-weight paper can trigger paperInInput sensors immediately after eject.
              // We don't want to treat that like a jam clear.
              NO_PAPER_ANYWHERE: undefined,
            },
          },
          _load_paper: {
            entry: async (context) => {
              await context.driver.loadPaper();
              await context.driver.parkPaper();
            },
            on: {
              PAPER_PARKED: 'done',
              NO_PAPER_ANYWHERE: '_accepting_paper',
            },
          },
          done: {
            type: 'final',
            entry: () => {
              assign({
                interpretation: undefined,
                scannedImagePaths: undefined,
              });
            },
          },
        },
        on: {
          // no-op for paper jam because ejecting heavy-weight paper to front results
          // in false positive
          PAPER_JAM: undefined,
        },
        onDone: { target: 'paper_reloaded' },
      },
      // paper_reloaded is a distinct state from paper_parked only
      // because the frontend handles them differently
      paper_reloaded: {
        invoke: pollAuthStatus(),
        entry: () => {
          debug('Placeholder paper_reloaded');
        },
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
          NO_PAPER_ANYWHERE: 'resetting_state_machine_after_success',
        },
      },
      // Ballot invalidation is a 2-stage process so the frontend can prompt the voter to get a pollworker
      waiting_for_invalidated_ballot_confirmation: {
        on: {
          VOTER_CONFIRMED_INVALIDATED_BALLOT: 'eject_to_front',
          // Even if ballot is removed from front, we still want the frontend to require pollworker auth before continuing
          NO_PAPER_ANYWHERE: undefined,
        },
      },
      // Eject-to-rear jam handling is a little clunky. It
      // 1. Tries to transition to success if no paper is detected
      // 2. If after a timeout we have not transitioned away (because paper still present), transition to jammed state
      // 3. Jam detection state transitions to jam reset state once it confirms no paper present
      eject_to_rear: {
        invoke: pollPaperStatus(),
        entry: async (context) => {
          await context.driver.parkPaper();
          await context.driver.ejectBallotToRear();
        },
        on: {
          NO_PAPER_ANYWHERE: 'resetting_state_machine_after_success',
          PAPER_JAM: 'jammed',
        },
        after: {
          [DELAY_BEFORE_DECLARING_REAR_JAM_MS]: 'jammed',
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
          });
        },
        always: 'not_accepting_paper',
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
        // behavior, since others would be too verbose (e.g. scanner client
        // object)
        .filter(([key]) =>
          ['pollingIntervalMs', 'scannedImagePaths', 'interpretation'].includes(
            key
          )
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

export async function getPaperHandlerStateMachine(
  driver: PaperHandlerDriverInterface,
  workspace: Workspace,
  auth: InsertedSmartCardAuthApi,
  logger: Logger,
  devicePollingIntervalMs: number = PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS,
  authPollingIntervalMs: number = AUTH_STATUS_POLLING_INTERVAL_MS
): Promise<Optional<PaperHandlerStateMachine>> {
  const initialContext: Context = {
    auth,
    workspace,
    driver,
    devicePollingIntervalMs,
    authPollingIntervalMs,
  };

  const machine = buildMachine(initialContext, auth);
  const machineService = interpret(machine).start();
  setUpLogging(machineService, logger);
  await setDefaults(driver);

  return {
    stopMachineService(): void {
      machineService.stop();
    },

    getRawDeviceStatus(): Promise<PaperHandlerStatus> {
      return driver.getPaperHandlerStatus();
    },

    getSimpleStatus(): SimpleServerStatus {
      const { state } = machineService;

      switch (true) {
        case state.matches('not_accepting_paper'):
          return 'not_accepting_paper';
        case state.matches('accepting_paper'):
          return 'accepting_paper';
        case state.matches('loading_paper'):
          return 'loading_paper';
        case state.matches('waiting_for_ballot_data'):
          return 'waiting_for_ballot_data';
        case state.matches('printing_ballot'):
          return 'printing_ballot';
        case state.matches('scanning'):
          return 'scanning';
        case state.matches('interpreting'):
          return 'interpreting';
        case state.matches('waiting_for_invalidated_ballot_confirmation'):
          return 'waiting_for_invalidated_ballot_confirmation';
        case state.matches('presenting_ballot'):
          return 'presenting_ballot';
        case state.matches('eject_to_front'):
          return 'ejecting_to_front';
        case state.matches('eject_to_rear'):
          return 'ejecting_to_rear';
        case state.matches('jammed'):
          return 'jammed';
        case state.matches('jam_physically_cleared'):
          return 'jam_cleared';
        case state.matches('resetting_state_machine_after_jam'):
          return 'resetting_state_machine_after_jam';
        case state.matches('resetting_state_machine_after_success'):
          return 'resetting_state_machine_after_success';
        case state.matches('transition_interpretation'):
          return 'transition_interpretation';
        case state.matches('blank_page_interpretation'):
          return 'blank_page_interpretation';
        case state.matches('paper_reloaded'):
          return 'paper_reloaded';
        default:
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
    },

    invalidateBallot(): void {
      machineService.send({
        type: 'VOTER_INVALIDATED_BALLOT',
      });
    },

    confirmInvalidateBallot(): void {
      machineService.send({
        type: 'VOTER_CONFIRMED_INVALIDATED_BALLOT',
      });
    },
  };
}
