import {
  ClientDisconnectedError,
  createClient,
  DEFAULT_CONFIG,
  PaperStatus,
  ScannerClient,
  ScannerError,
} from '@votingworks/plustek-sdk';
import { v4 as uuid } from 'uuid';
import { err, Id, ok, Result } from '@votingworks/types';
import { assert, throwIllegalValue } from '@votingworks/utils';
import { switchMap, timer } from 'rxjs';
import {
  assign as xassign,
  Assigner,
  createMachine,
  interpret,
  InvokeConfig,
  PropertyAssigner,
  send,
} from 'xstate';
import { Scan } from '@votingworks/api';
import makeDebug from 'debug';
import { waitFor } from 'xstate/lib/waitFor';
import {
  SheetInterpretation,
  SimpleInterpreter,
  storeInterpretedSheet,
} from './simple_interpreter';
import { SheetOf } from './types';
import { Store } from './store';

const PAPER_STATUS_POLLING_INTERVAL = 500;

export type CreatePlustekClient = typeof createClient;

const debug = makeDebug('scan:precinct-scanner');
const debugPaperStatus = debug.extend('paper-status');
const debugEvents = debug.extend('events');

// Temporary mode to control whether we interpreting ballots or not
export type InterpretationMode = 'interpret' | 'skip';

class PrecinctScannerError extends Error {
  // eslint-disable-next-line vx/gts-no-public-class-fields
  constructor(public type: Scan.PrecinctScannerErrorType, message?: string) {
    super(message ?? type);
  }
}

type InterpretationResult = SheetInterpretation & { sheetId: Id };

export interface Context {
  store?: Store;
  interpreter?: SimpleInterpreter;
  client?: ScannerClient;
  scannedSheet?: SheetOf<string>;
  interpretation?: InterpretationResult;
  error?: Error;
  interpretationMode: InterpretationMode;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assign(arg: Assigner<Context, any> | PropertyAssigner<Context, any>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return xassign<Context, any>(arg);
}

type ConfigurationEvent =
  | { type: 'CONFIGURE'; store: Store; interpreter: SimpleInterpreter }
  | { type: 'UNCONFIGURE' };

type ScannerStatusEvent =
  | { type: 'SCANNER_NO_PAPER' }
  | { type: 'SCANNER_READY_TO_SCAN' }
  | { type: 'SCANNER_READY_TO_EJECT' }
  | { type: 'SCANNER_BOTH_SIDES_HAVE_PAPER' }
  | { type: 'SCANNER_JAM' }
  | { type: 'SCANNER_DISCONNECTED' };

interface InterpretationResultEvent {
  type: 'INTERPRETATION_RESULT';
  interpretation: InterpretationResult;
}

type CommandEvent =
  | { type: 'SCAN' }
  | { type: 'ACCEPT' }
  | { type: 'RETURN' }
  | { type: 'CALIBRATE' };

export type Event =
  | ScannerStatusEvent
  | InterpretationResultEvent
  | CommandEvent
  | ConfigurationEvent
  | { type: 'SET_INTERPRETATION_MODE'; mode: InterpretationMode };

interface Delays {
  DELAY_RECONNECT: number;
  DELAY_ACCEPTED_RESET_TO_NO_PAPER: number;
}

function connectToPlustek(createPlustekClient: CreatePlustekClient) {
  return async (): Promise<ScannerClient> => {
    debug('Connecting to plustek');
    const plustekClient = await createPlustekClient(DEFAULT_CONFIG);
    debug('Plustek client connected: %s', plustekClient.isOk());
    return plustekClient.unsafeUnwrap();
  };
}

function paperStatusToEvent(paperStatus: PaperStatus): ScannerStatusEvent {
  switch (paperStatus) {
    // When there's no paper in the scanner
    case PaperStatus.NoPaperStatus:
    case PaperStatus.VtmDevReadyNoPaper:
      return { type: 'SCANNER_NO_PAPER' };
    // When there's a paper held in the front
    case PaperStatus.VtmReadyToScan:
      return { type: 'SCANNER_READY_TO_SCAN' };
    // When there's a paper held in the back
    case PaperStatus.VtmReadyToEject:
      return { type: 'SCANNER_READY_TO_EJECT' };
    // When there's a paper held in the back and inserted in the front
    case PaperStatus.VtmBothSideHavePaper:
      return { type: 'SCANNER_BOTH_SIDES_HAVE_PAPER' };
    // When there's a paper jammed in the scanner
    case PaperStatus.Jam:
    case PaperStatus.VtmFrontAndBackSensorHavePaperReady:
      return { type: 'SCANNER_JAM' };
    default:
      throw new PrecinctScannerError(
        'unexpected_paper_status',
        `Unexpected paper status: ${paperStatus}`
      );
  }
}

function paperStatusErrorToEvent(
  error: ScannerError | Error
): ScannerStatusEvent {
  if (error instanceof ClientDisconnectedError) {
    return { type: 'SCANNER_DISCONNECTED' };
  }
  switch (error) {
    // This error code happens when the paper gets blocked and tries to scan for
    // a long time (or if you just hold onto the paper while scanning).
    case ScannerError.SaneStatusInval:
      return { type: 'SCANNER_JAM' };
    case ScannerError.SaneStatusIoError:
      return { type: 'SCANNER_DISCONNECTED' };
    default:
      throw error;
  }
}

// Create a paper status observable, then use internal transitions to avoid
// changing state when paper status doesn't change
function paperStatusObserver({ client }: Context) {
  assert(client);
  return timer(0, PAPER_STATUS_POLLING_INTERVAL).pipe(
    switchMap(async () => {
      const paperStatus = await client.getPaperStatus();
      debugPaperStatus('Paper status: %s', paperStatus);
      return paperStatus.isOk()
        ? paperStatusToEvent(paperStatus.ok())
        : paperStatusErrorToEvent(paperStatus.err());
    })
  );
}

const pollPaperStatus: InvokeConfig<Context, Event> = {
  src: paperStatusObserver,
  onError: {
    target: 'error',
    actions: assign({ error: (_, event) => event.data }),
  },
};

async function scan({ client }: Context): Promise<SheetOf<string>> {
  assert(client);
  debug('Scanning');
  const scanResult = await client.scan();
  debug('Scan result: %o', scanResult);
  const [front, back] = scanResult.unsafeUnwrap().files;
  return [front, back];
}

async function calibrate({ client }: Context) {
  assert(client);
  debug('Calibrating');
  const calibrateResult = await client.calibrate();
  debug('Calibrate result: %o', calibrateResult);
  return calibrateResult.unsafeUnwrap();
}

async function interpretSheet({
  interpreter,
  scannedSheet,
  interpretationMode,
}: Context): Promise<InterpretationResult> {
  assert(interpreter);
  assert(scannedSheet);

  if (interpretationMode === 'skip') {
    return {
      type: 'ValidSheet',
      pages: [
        {
          originalFilename: '/front-original-mock',
          normalizedFilename: '/front-normalized-mock',
          interpretation: { type: 'BlankPage' },
        },
        {
          originalFilename: '/back-original-mock',
          normalizedFilename: '/back-normalized-mock',
          interpretation: { type: 'BlankPage' },
        },
      ],
      sheetId: 'mock-sheet-id',
    };
  }

  const sheetId = uuid();
  const interpretation = (
    await interpreter.interpret(sheetId, scannedSheet)
  ).unsafeUnwrap();
  return {
    ...interpretation,
    sheetId,
  };
}

async function accept({ client }: Context) {
  assert(client);
  debug('Accepting');
  const acceptResult = await client.accept();
  debug('Accept result: %o', acceptResult);
  return acceptResult.unsafeUnwrap();
}

function storeAcceptedSheet({ store, interpretation }: Context) {
  assert(store);
  assert(interpretation);
  const { sheetId, pages } = interpretation;
  storeInterpretedSheet(store, sheetId, pages);
  debug('Stored accepted sheet: %s', sheetId);
}

async function reject({ client }: Context) {
  assert(client);
  debug('Rejecting');
  const rejectResult = await client.reject({ hold: true });
  debug('Reject result: %o', rejectResult);
  return rejectResult.unsafeUnwrap();
}

const clearLastScan = assign({
  scannedSheet: undefined,
  interpretation: undefined,
});

function buildMachine(createPlustekClient: CreatePlustekClient) {
  return createMachine<Context, Event>(
    {
      id: 'precint_scanner',
      initial: 'connecting',
      strict: true,
      context: {
        interpretationMode: 'interpret',
      },
      on: {
        UNCONFIGURE: {
          target: 'waiting_for_configuration',
          actions: assign({ store: undefined }),
        },
        CONFIGURE: {
          actions: assign({
            store: (_, event) => event.store,
            interpreter: (_, event) => event.interpreter,
          }),
        },
        SCANNER_DISCONNECTED: 'error_disconnected',
        SCANNER_BOTH_SIDES_HAVE_PAPER: 'error_both_sides_have_paper',
        SCANNER_JAM: 'error_jammed',
        // On unhandled commands, do nothing. This guards against any race
        // conditions where the frontend has an outdated scanner status and tries to
        // send a command.
        SCAN: {},
        ACCEPT: {},
        RETURN: {},
        CALIBRATE: {},
        SET_INTERPRETATION_MODE: {
          actions: assign({ interpretationMode: (_, event) => event.mode }),
        },
        // On events that are not handled by a specified transition (e.g. unhandled
        // paper status), return an error so we can figure out what happened
        '*': {
          target: 'error',
          actions: assign({
            error: (_context, event) =>
              new PrecinctScannerError(
                'unexpected_event',
                `Unexpected event: ${event.type}`
              ),
          }),
        },
      },
      // TODO should we close and reconnect to plustek after every scan finishes
      // to avoid long-running process crashes?
      states: {
        connecting: {
          invoke: {
            src: connectToPlustek(createPlustekClient),
            onDone: {
              target: 'waiting_for_configuration',
              actions: assign((_context, event) => ({
                client: event.data,
              })),
            },
            onError: 'error_disconnected',
          },
        },
        error_disconnected: {
          entry: clearLastScan,
          after: { DELAY_RECONNECT: 'reconnecting' },
        },
        reconnecting: {
          invoke: {
            src: connectToPlustek(createPlustekClient),
            onDone: {
              target: 'checking_initial_paper_status',
              actions: assign({
                client: (_context, event) => event.data,
                error: undefined,
              }),
            },
            onError: 'error_disconnected',
          },
        },
        waiting_for_configuration: {
          always: {
            target: 'checking_initial_paper_status',
            cond: (context) =>
              context.store !== undefined && context.interpreter !== undefined,
          },
        },
        checking_initial_paper_status: {
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: 'no_paper',
            SCANNER_READY_TO_SCAN: {
              target: 'rejecting',
              actions: assign({
                error: new PrecinctScannerError('paper_in_front_on_startup'),
              }),
            },
            SCANNER_READY_TO_EJECT: {
              target: 'rejecting',
              actions: assign({
                error: new PrecinctScannerError('paper_in_back_on_startup'),
              }),
            },
          },
        },
        no_paper: {
          entry: [assign({ error: undefined }), clearLastScan],
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: { target: 'no_paper', internal: true },
            SCANNER_READY_TO_SCAN: 'ready_to_scan',
          },
        },
        ready_to_scan: {
          invoke: pollPaperStatus,
          on: {
            SCAN: 'scanning',
            CALIBRATE: 'calibrating',
            SCANNER_NO_PAPER: 'no_paper',
            SCANNER_READY_TO_SCAN: { target: 'ready_to_scan', internal: true },
          },
        },
        scanning: {
          entry: assign({ error: undefined }),
          invoke: {
            src: scan,
            onDone: {
              target: 'checking_scanning_completed',
              actions: assign((_context, event) => ({
                scannedSheet: event.data,
              })),
            },
            onError: {
              target: 'error_scanning',
              actions: assign((_context, event) => ({ error: event.data })),
            },
          },
        },
        error_scanning: {
          invoke: pollPaperStatus,
          on: {
            SCANNER_READY_TO_SCAN: 'ready_to_scan',
            SCANNER_NO_PAPER: 'no_paper',
            SCANNER_READY_TO_EJECT: 'rejecting',
          },
        },
        // Sometimes Plustek auto-rejects the ballot without returning a scanning
        // error (e.g. if the paper is slightly mis-aligned). So we need to check
        // that the paper is still there before interpreting.
        checking_scanning_completed: {
          invoke: pollPaperStatus,
          on: {
            SCANNER_READY_TO_EJECT: 'interpreting',
            SCANNER_NO_PAPER: 'error_scanning',
            SCANNER_READY_TO_SCAN: 'error_scanning',
          },
        },
        interpreting: {
          invoke: {
            src: interpretSheet,
            onDone: {
              actions: [
                assign({ interpretation: (_context, event) => event.data }),
                send((_context, event) => ({
                  type: 'INTERPRETATION_RESULT',
                  interpretation: event.data,
                })),
              ],
            },
            onError: {
              target: 'rejecting',
              actions: assign((_context, event) => ({ error: event.data })),
            },
          },
          on: {
            INTERPRETATION_RESULT: [
              {
                target: 'ready_to_accept',
                cond: (_context, event) =>
                  event.interpretation.type === 'ValidSheet',
              },
              {
                target: 'rejecting',
                cond: (_context, event) =>
                  event.interpretation.type === 'InvalidSheet',
              },
              {
                target: 'needs_review',
                cond: (_context, event) =>
                  event.interpretation.type === 'NeedsReviewSheet',
              },
            ],
          },
        },
        ready_to_accept: {
          on: { ACCEPT: 'accepting' },
        },
        accepting: {
          invoke: {
            src: accept,
            onDone: 'checking_accepting_completed',
            onError: {
              target: 'rejecting',
              actions: assign({ error: (_context, event) => event.data }),
            },
          },
        },
        checking_accepting_completed: {
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: 'accepted',
            SCANNER_READY_TO_SCAN: 'accepted',
            // If the paper didn't get dropped, it's an error
            SCANNER_READY_TO_EJECT: {
              target: 'rejecting',
              actions: assign({
                error: new PrecinctScannerError('paper_in_back_after_accept'),
              }),
            },
          },
        },
        accepted: {
          entry: storeAcceptedSheet,
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: { target: 'accepted', internal: true },
            SCANNER_READY_TO_SCAN: {
              target: 'ready_to_scan',
              actions: clearLastScan,
            },
          },
          after: { DELAY_ACCEPTED_RESET_TO_NO_PAPER: 'no_paper' },
        },
        needs_review: {
          on: {
            ACCEPT: 'accepting',
            RETURN: 'returning',
          },
        },
        returning: {
          invoke: {
            src: reject,
            onDone: 'checking_returning_completed',
            onError: 'error_jammed',
          },
        },
        // After rejecting, before the plustek grabs the paper to hold it, it sends
        // NO_PAPER status for a bit before sending READY_TO_SCAN. So we need to
        // wait for the READY_TO_SCAN.
        checking_returning_completed: {
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: {
              target: 'checking_returning_completed',
              internal: true,
            },
            SCANNER_READY_TO_SCAN: 'returned',
            SCANNER_READY_TO_EJECT: 'error_jammed',
          },
          // But, if you pull the paper out right after rejecting, we go straight to
          // NO_PAPER, skipping READY_TO_SCAN completely. So we need to eventually
          // timeout waiting for READY_TO_SCAN.
          after: { DELAY_WAIT_FOR_HOLD_AFTER_REJECT: 'no_paper' },
        },
        returned: {
          invoke: pollPaperStatus,
          on: {
            SCANNER_READY_TO_SCAN: { target: 'returned', internal: true },
            SCANNER_NO_PAPER: 'no_paper',
          },
        },
        rejecting: {
          invoke: {
            src: reject,
            onDone: 'checking_rejecting_completed',
            onError: 'error_jammed',
          },
        },
        // After rejecting, before the plustek grabs the paper to hold it, it sends
        // NO_PAPER status for a bit before sending READY_TO_SCAN. So we need to
        // wait for the READY_TO_SCAN.
        checking_rejecting_completed: {
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: {
              target: 'checking_rejecting_completed',
              internal: true,
            },
            SCANNER_READY_TO_SCAN: 'rejected',
            SCANNER_READY_TO_EJECT: 'error_jammed',
          },
          // But, if you pull the paper out right after rejecting, we go straight to
          // NO_PAPER, skipping READY_TO_SCAN completely. So we need to eventually
          // timeout waiting for READY_TO_SCAN.
          after: { DELAY_WAIT_FOR_HOLD_AFTER_REJECT: 'no_paper' },
        },
        // Paper has been rejected and is held in the front, waiting for removal.
        rejected: {
          invoke: pollPaperStatus,
          on: {
            SCANNER_READY_TO_SCAN: { target: 'rejected', internal: true },
            SCANNER_NO_PAPER: 'no_paper',
          },
        },
        calibrating: {
          entry: assign({ error: undefined }),
          invoke: {
            src: calibrate,
            onDone: 'checking_calibration_completed',
            onError: {
              target: 'checking_calibration_completed',
              actions: assign({ error: (_context, event) => event.data }),
            },
          },
        },
        checking_calibration_completed: {
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: 'no_paper',
            SCANNER_READY_TO_SCAN: 'ready_to_scan',
          },
        },
        error_jammed: {
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: 'no_paper',
            SCANNER_JAM: { target: 'error_jammed', internal: true },
            SCANNER_READY_TO_SCAN: { target: 'error_jammed', internal: true },
            SCANNER_READY_TO_EJECT: { target: 'error_jammed', internal: true },
          },
        },
        error_both_sides_have_paper: {
          entry: assign({
            error: new PrecinctScannerError('both_sides_have_paper'),
          }),
          invoke: pollPaperStatus,
          on: {
            SCANNER_BOTH_SIDES_HAVE_PAPER: {
              target: 'error_both_sides_have_paper',
              internal: true,
            },
            // For now, if the front paper is removed, just reject the back paper,
            // since we don't have context on how we got here and what was supposed
            // to happen.
            SCANNER_READY_TO_EJECT: 'rejecting',
            SCANNER_NO_PAPER: 'rejecting',
          },
        },
        error: {},
      },
    },
    {
      delays: {
        // When disconnected, how long to wait before trying to reconnect.
        DELAY_RECONNECT: 500,
        // How long to wait on the accepted state before automatically going
        // back to no_paper.
        DELAY_ACCEPTED_RESET_TO_NO_PAPER: 5000,
        // How long to wait for Plustek to grab the paper and return paper
        // status READY_TO_SCAN after rejecting. Needs to be greater than
        // PAPER_STATUS_POLLING_INTERVAL otherwise we'll never have a chance to
        // see the READY_TO_SCAN status. Experimentally, 1000ms seems to be a
        // good amount. Don't change this delay lightly since it impacts the
        // actual logic of the scanner.
        DELAY_WAIT_FOR_HOLD_AFTER_REJECT: 1000,
      },
    }
  );
}

function errorToString(error: Context['error']) {
  return error instanceof PrecinctScannerError ? error.type : 'plustek_error';
}

export interface PrecinctScannerStateMachine {
  configure: (store: Store, interpreter: SimpleInterpreter) => void;
  unconfigure: () => void;
  status: () => Scan.PrecinctScannerMachineStatus;
  // The commands are non-blocking and do not return a result. They just send an
  // event to the machine. The effects of the event (or any error) will show up
  // in the status.
  scan: () => void;
  accept: () => void;
  return: () => void;
  // Calibrate is the exception, which blocks until calibration is finished and
  // returns a result.
  calibrate: () => Promise<Result<void, string>>;
}

export function createPrecinctScannerStateMachine(
  createPlustekClient: CreatePlustekClient,
  delays: Partial<Delays> = {}
): PrecinctScannerStateMachine {
  const machine = buildMachine(createPlustekClient).withConfig({ delays });
  const machineService = interpret(machine).start();

  // Set up debug logging
  machineService
    .onEvent((event) => debugEvents('Event: %s', event))
    .onChange((context, previousContext) => {
      if (!previousContext) return;
      const changed = Object.entries(context).filter(
        ([key, value]) => previousContext[key as keyof Context] !== value
      );
      if (changed.length === 0) return;
      debug('Context update: %o', Object.fromEntries(changed));
    })
    .onTransition(
      (state) => state.changed && debug('Transition to: %s', state.value)
    );

  return {
    configure: (store: Store, interpreter: SimpleInterpreter) => {
      machineService.send({ type: 'CONFIGURE', store, interpreter });
    },

    unconfigure: () => {
      machineService.send({ type: 'UNCONFIGURE' });
    },

    status: (): Scan.PrecinctScannerMachineStatus => {
      const { state } = machineService;
      const scannerState = (() => {
        switch (true) {
          case state.matches('waiting_for_configuration'):
            return 'unconfigured';
          case state.matches('connecting'):
            return 'connecting';
          case state.matches('checking_initial_paper_status'):
            return 'connecting';
          case state.matches('error_disconnected'):
            return 'disconnected';
          case state.matches('reconnecting'):
            return 'disconnected';
          case state.matches('no_paper'):
            return 'no_paper';
          case state.matches('ready_to_scan'):
            return 'ready_to_scan';
          case state.matches('scanning'):
            return 'scanning';
          case state.matches('error_scanning'):
            return 'scanning';
          case state.matches('checking_scanning_completed'):
            return 'scanning';
          case state.matches('interpreting'):
            return 'scanning';
          case state.matches('ready_to_accept'):
            return 'ready_to_accept';
          case state.matches('accepting'):
            return 'accepting';
          case state.matches('checking_accepting_completed'):
            return 'accepting';
          case state.matches('accepted'):
            return 'accepted';
          case state.matches('needs_review'):
            return 'needs_review';
          case state.matches('returning'):
            return 'returning';
          case state.matches('checking_returning_completed'):
            return 'returning';
          case state.matches('returned'):
            return 'returned';
          case state.matches('rejecting'):
            return 'rejecting';
          case state.matches('checking_rejecting_completed'):
            return 'rejecting';
          case state.matches('rejected'):
            return 'rejected';
          case state.matches('calibrating'):
            return 'calibrating';
          case state.matches('calibrated'):
            return 'calibrated';
          case state.matches('error_jammed'):
            return 'jammed';
          case state.matches('error_both_sides_have_paper'):
            return 'both_sides_have_paper';
          case state.matches('error'):
            return 'error';
          default:
            throw new Error(`Unexpected state: ${state.value}`);
        }
      })();
      const { error, interpretation } = state.context;
      // Remove interpretation details that are only used internally (e.g. sheetId, pages)
      const interpretationResult: Scan.SheetInterpretation | undefined =
        (() => {
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
            default:
              throwIllegalValue(interpretation, 'type');
          }
        })();
      // TODO log any errors, especially unexpected paper status/event or other unexpected errors
      return {
        state: scannerState,
        interpretation: interpretationResult,
        error: error && errorToString(error),
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

    calibrate: async () => {
      machineService.send('CALIBRATE');
      await waitFor(machineService, (state) => !state.matches('calibrating'), {
        timeout: 20_000,
      });
      const { error } = machineService.state.context;
      return error ? err(errorToString(error)) : ok();
    },
  };
}
