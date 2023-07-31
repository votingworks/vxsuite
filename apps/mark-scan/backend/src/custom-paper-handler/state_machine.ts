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
import { Optional, assert } from '@votingworks/basics';
import { SheetOf } from '@votingworks/types';
import { singlePrecinctSelectionFor } from '@votingworks/utils';
import { Workspace } from '../util/workspace';
import { SimpleServerStatus } from './types';
import {
  PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS,
  PAPER_HANDLER_STATUS_POLLING_TIMEOUT_MS,
} from './constants';
import {
  interpretScannedBallots,
  isPaperInScanner,
  isPaperReadyToLoad,
  isPaperInOutput,
  scanAndSave,
  setDefaults,
  printBallot as driverPrintBallot,
} from './application_driver';

interface Context {
  workspace: Workspace;
  driver: PaperHandlerDriver;
  pollingIntervalMs: number;
  scannedImagePaths?: SheetOf<string>;
}

function assign(arg: Assigner<Context, any> | PropertyAssigner<Context, any>) {
  return xassign<Context, any>(arg);
}

type PaperHandlerStatusEvent =
  | { type: 'NO_PAPER_IN_FRONT' }
  | { type: 'PAPER_READY_TO_LOAD' }
  | { type: 'PAPER_INSIDE' }
  | { type: 'VOTER_INITIATED_PRINT'; pdfData: Buffer }
  | { type: 'PAPER_IN_OUTPUT' }
  | { type: 'SCANNING' }
  | { type: 'PAPER_REMOVED' }
  | { type: 'END' };

const debug = makeDebug('mark-scan:state-machine');

export class PaperHandlerStateMachine {
  constructor(
    private readonly driver: PaperHandlerDriver,
    private readonly machineService: Interpreter<
      Context,
      any,
      PaperHandlerStatusEvent,
      any,
      any
    >
  ) {}

  stopMachineService(): void {
    this.machineService.stop();
  }

  // Leftover wrapper. Keeping this so the interface between API and state machine is the same until
  // I can get around to migrating it later in the PR
  getSimpleStatus(): SimpleServerStatus {
    const { state } = this.machineService;
    debug(`getSimpleStatus polled. state=${state.value}`);

    switch (true) {
      case state.matches('no_paper'):
        return 'no_paper';
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
      case state.matches('presenting_ballot'):
        return 'presenting_ballot';
      default:
        return 'no_hardware';
    }
  }

  printBallot(pdfData: Buffer): void {
    this.machineService.send({
      type: 'VOTER_INITIATED_PRINT',
      pdfData,
    });
  }
}

function paperHandlerStatusToEvent(
  paperHandlerStatus: PaperHandlerStatus
): PaperHandlerStatusEvent {
  let event: PaperHandlerStatusEvent = { type: 'NO_PAPER_IN_FRONT' };

  if (isPaperInScanner(paperHandlerStatus)) {
    if (isPaperInOutput(paperHandlerStatus)) {
      event = { type: 'PAPER_IN_OUTPUT' };
    } else {
      event = { type: 'PAPER_INSIDE' };
    }
  } else if (isPaperReadyToLoad(paperHandlerStatus)) {
    event = { type: 'PAPER_READY_TO_LOAD' };
  }
  debug(`Emitting event ${event.type}`);
  return event;
}

/**
 * Builds an observable that polls paper status and emits state machine events.
 * Notes:
 * Why Observable? This section from the xstate docs matches our use case closely:
 * https://xstate.js.org/docs/guides/communication.html#invoking-observables
 * "Observables can be invoked, which is expected to send events (strings or objects) to the parent machine,
 * yet not receive events (uni-directional). An observable invocation is a function that takes context and
 * event as arguments and returns an observable stream of events."
 *
 *
 */
function buildPaperStatusObservable() {
  return ({ driver, pollingIntervalMs }: Context) => {
    // `timer` returns an Observable that emits values with `pollingInterval` delay between each event
    return (
      timer(0, pollingIntervalMs)
        // `pipe` forwards the value from the previous function to the next unary function ie. switchMap.
        // In this case there is no value. The combination of timer(...).pipe() is so we can execute the
        // function supplied to `switchMap` on the specified interval.
        .pipe(
          // `switchMap` returns an Observable that emits events.
          switchMap(async () => {
            // Get raw status, map to event, and emit event
            const paperHandlerStatus = await driver.getPaperHandlerStatus();
            return paperHandlerStatusToEvent(paperHandlerStatus);
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

function loadMetadataAndInterpretBallot(context: Context) {
  const { scannedImagePaths, workspace } = context;
  const { store } = workspace;
  const electionDefinition = store.getElectionDefinition();

  assert(scannedImagePaths);
  assert(electionDefinition);

  const { precincts } = electionDefinition.election;
  // Hard coded for now because we don't store precinct in backend. This
  // will be replaced with a store read in a future PR.
  const precinct = precincts[precincts.length - 1];
  const precinctSelection = singlePrecinctSelectionFor(precinct.id);
  const testMode = true;
  return interpretScannedBallots(
    electionDefinition,
    precinctSelection,
    testMode,
    scannedImagePaths
  );
}

export function buildMachine(
  workspace: Workspace,
  driver: PaperHandlerDriver,
  pollingIntervalMs: number
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
    initial: 'no_paper',
    context: {
      workspace,
      driver,
      pollingIntervalMs,
    },
    states: {
      no_paper: {
        invoke: pollPaperStatus(),
        on: {
          PAPER_READY_TO_LOAD: {
            target: 'loading_paper',
          },
        },
      },
      loading_paper: {
        invoke: pollPaperStatus(),
        entry: (context) => {
          // Paper can trigger sensors before it's actually able to be loaded,
          // so we wait to decrease chance of failed load
          setTimeout(async () => {
            await context.driver.loadPaper();
            await context.driver.parkPaper();
          }, 300);
        },
        on: {
          PAPER_INSIDE: {
            target: 'waiting_for_ballot_data',
          },
        },
      },
      waiting_for_ballot_data: {
        on: {
          VOTER_INITIATED_PRINT: {
            target: 'printing_ballot',
          },
        },
      },
      printing_ballot: {
        invoke: pollPaperStatus(),
        entry: (context, event) => {
          // Need to hint to Typescript that we want the 'VOTER_INITIATED_PRINT' event in our union type of events
          if ('pdfData' in event) {
            void driverPrintBallot(context.driver, event.pdfData, {});
          } else {
            throw new Error(
              `printing_ballot entry called by unsupported event type: ${event.type}`
            );
          }
        },
        on: {
          PAPER_IN_OUTPUT: {
            target: 'scanning',
          },
        },
      },
      scanning: {
        invoke: {
          id: 'scanAndSave',
          src: (context) => {
            return scanAndSave(context.driver);
          },
          onDone: {
            target: 'interpreting',
            actions: assign({ scannedImagePaths: (_, event) => event.data }),
          },
        },
      },
      interpreting: {
        invoke: {
          id: 'interpretScannedBallot',
          src: loadMetadataAndInterpretBallot,
          onDone: {
            target: 'presenting_ballot',
          },
        },
      },
      presenting_ballot: {
        entry: async (context) => {
          await context.driver.presentPaper();
        },
      },
    },
  });
}

export async function getPaperHandlerStateMachine(
  paperHandlerDriver: PaperHandlerDriverInterface,
  workspace: Workspace,
  pollingIntervalMs: number = PAPER_HANDLER_STATUS_POLLING_INTERVAL_MS
): Promise<Optional<PaperHandlerStateMachine>> {
  const machine = buildMachine(
    workspace,
    paperHandlerDriver,
    pollingIntervalMs
  );
  const machineService = interpret(machine)
    .onTransition((state) => {
      if (state.changed) {
        debug(`+state: ${state.value}`);
      }
    })
    .start();
  const paperHandlerStateMachine = new PaperHandlerStateMachine(
    paperHandlerDriver,
    machineService
  );
  await setDefaults(paperHandlerDriver);
  return paperHandlerStateMachine;
}
