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
import { switchMap, throwError, timeout, timer } from 'rxjs';
import {
  assign as xassign,
  Assigner,
  BaseActionObject,
  createMachine,
  interpret,
  Interpreter,
  InvokeConfig,
  PropertyAssigner,
  StateNodeConfig,
  TransitionConfig,
} from 'xstate';
import { Scan } from '@votingworks/api';
import makeDebug from 'debug';
import { waitFor } from 'xstate/lib/waitFor';
import { LogEventId, Logger, LogLine } from '@votingworks/logging';
import {
  SheetInterpretation,
  PrecinctScannerInterpreter,
} from './precinct_scanner_interpreter';
import { SheetOf } from './types';
import { Store } from './store';

const debug = makeDebug('scan:precinct-scanner');
const debugPaperStatus = debug.extend('paper-status');
const debugEvents = debug.extend('events');

// 10 attempts is about the amount of time it takes for Plustek to stop trying
// to grab the paper. Up until that point, if you reposition the paper so the
// rollers grab it, it will get scanned successfully.
export const MAX_FAILED_SCAN_ATTEMPTS = 10;

export type CreatePlustekClient = typeof createClient;

class PrecinctScannerError extends Error {
  // eslint-disable-next-line vx/gts-no-public-class-fields
  constructor(public type: Scan.PrecinctScannerErrorType, message?: string) {
    super(message ?? type);
  }
}

type InterpretationResult = SheetInterpretation & { sheetId: Id };

interface Context {
  client?: ScannerClient;
  scannedSheet?: SheetOf<string>;
  interpretation?: InterpretationResult;
  error?: Error | ScannerError;
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
  | { type: 'SCANNER_DISCONNECTED' };

type CommandEvent =
  | { type: 'SCAN' }
  | { type: 'ACCEPT' }
  | { type: 'RETURN' }
  | { type: 'CALIBRATE' };

export type Event = ScannerStatusEvent | CommandEvent;

export interface Delays {
  DELAY_PAPER_STATUS_POLLING_INTERVAL: number;
  DELAY_PAPER_STATUS_POLLING_TIMEOUT: number;
  DELAY_SCANNING_TIMEOUT: number;
  DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT: number;
  DELAY_ACCEPTED_RESET_TO_NO_PAPER: number;
  DELAY_WAIT_FOR_HOLD_AFTER_REJECT: number;
  DELAY_RECONNECT: number;
  DELAY_RECONNECT_ON_UNEXPECTED_ERROR: number;
  DELAY_KILL_AFTER_DISCONNECT_TIMEOUT: number;
}

function connectToPlustek(createPlustekClient: CreatePlustekClient) {
  return async (): Promise<ScannerClient> => {
    debug('Connecting to plustek');
    const plustekClient = await createPlustekClient(DEFAULT_CONFIG);
    debug('Plustek client connected: %s', plustekClient.isOk());
    return plustekClient.unsafeUnwrap();
  };
}

async function closePlustekClient({ client }: Context) {
  if (!client) return;
  debug('Closing plustek client');
  await client.close();
  debug('Plustek client closed');
}

async function killPlustekClient({ client }: Context) {
  if (!client) return;
  debug('Killing plustek client');
  await new Promise((resolve) => resolve(client.kill().unsafeUnwrap()));
  debug('Plustek client killed');
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
        const paperStatus = await client.getPaperStatus();
        debugPaperStatus('Paper status: %s', paperStatus);
        return paperStatus.isOk()
          ? paperStatusToEvent(paperStatus.ok())
          : paperStatusErrorToEvent(paperStatus.err());
      }),
      timeout({
        each: pollingTimeout,
        with: () =>
          throwError(() => new PrecinctScannerError('paper_status_timed_out')),
      })
    );
  };
}

async function scan({ client }: Context): Promise<SheetOf<string>> {
  assert(client);
  debug('Scanning');
  const scanResult = await client.scan();
  debug('Scan result: %o', scanResult);
  return scanResult.unsafeUnwrap().files;
}

async function calibrate({ client }: Context) {
  assert(client);
  debug('Calibrating');
  const calibrateResult = await client.calibrate();
  debug('Calibrate result: %o', calibrateResult);
  return calibrateResult.unsafeUnwrap();
}

async function interpretSheet(
  interpreter: PrecinctScannerInterpreter,
  { scannedSheet }: Context
): Promise<InterpretationResult> {
  assert(scannedSheet);
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

async function reject({ client }: Context) {
  assert(client);
  debug('Rejecting');
  const rejectResult = await client.reject({ hold: true });
  debug('Reject result: %o', rejectResult);
  return rejectResult.unsafeUnwrap();
}

function storeInterpretedSheet(
  store: Store,
  sheetId: Id,
  interpretation: SheetInterpretation
): Id {
  // For now, we create one batch per ballot, since we don't use the concept of
  // batches for precinct scanning. In the future, it might make more sense to
  // have one batch per scanning session (e.g. from polls open to polls close).
  const batchId = store.addBatch();
  const addedSheetId = store.addSheet(sheetId, batchId, interpretation.pages);
  store.finishBatch({ batchId });
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
    store.adjudicateSheet(sheetId, 'front', []);
    store.adjudicateSheet(sheetId, 'back', []);
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

const defaultDelays: Delays = {
  // Time between calls to get paper status from the scanner.
  DELAY_PAPER_STATUS_POLLING_INTERVAL: 500,
  // How long to wait for a single paper status call to return before giving up.
  DELAY_PAPER_STATUS_POLLING_TIMEOUT: 5_000,
  // How long to attempt scanning before giving up and disconnecting and
  // reconnecting to Plustek.
  DELAY_SCANNING_TIMEOUT: 10_000,
  // When in accepted state, how long to ignore any new ballot that is
  // inserted (this ensures the user sees the accepted screen for a bit
  // before starting a new scan).
  DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT: 2_000,
  // How long to wait on the accepted state before automatically going
  // back to no_paper.
  DELAY_ACCEPTED_RESET_TO_NO_PAPER: 5_000,
  // How long to wait for Plustek to grab the paper and return paper
  // status READY_TO_SCAN after rejecting. Needs to be greater than
  // PAPER_STATUS_POLLING_INTERVAL otherwise we'll never have a chance to
  // see the READY_TO_SCAN status. Experimentally, 1000ms seems to be a
  // good amount. Don't change this delay lightly since it impacts the
  // actual logic of the scanner.
  DELAY_WAIT_FOR_HOLD_AFTER_REJECT: 1_000,
  // When disconnected, how long to wait before trying to reconnect.
  DELAY_RECONNECT: 500,
  // When we run into an unexpected error (e.g. unexpected paper status),
  // how long to wait before trying to reconnect. This should be pretty
  // long in order to let Plustek finish whatever it's doing (yes, even
  // after disconnecting, Plustek might keep scanning).
  DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 5_000,
  // When attempting to disconnect from Plustek after an unexpected error,
  // how long to wait before giving up on disconnecting the "nice" way and
  // just sending a kill signal.
  DELAY_KILL_AFTER_DISCONNECT_TIMEOUT: 2_000,
};

function buildMachine(
  createPlustekClient: CreatePlustekClient,
  store: Store,
  interpreter: PrecinctScannerInterpreter,
  delayOverrides: Partial<Delays>
) {
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
    states: {
      starting: {
        invoke: {
          src: accept,
          onDone: 'checking_completed',
          // In some cases, Plustek can return an error even if the paper got
          // accepted, so we need to check paper status to determine what to do
          // next. We still record the error for debugging purposes.
          onError: {
            target: 'checking_completed',
            actions: assign({ error: (_context, event) => event.data }),
          },
        },
      },
      checking_completed: {
        invoke: pollPaperStatus,
        on: {
          SCANNER_NO_PAPER: '#accepted',
          // If there's a paper in front, that means the ballot in back did get
          // dropped but somebody quickly inserted a new ballot in front, so we
          // should count the first ballot as accepted.
          SCANNER_READY_TO_SCAN: '#accepted',
          // If the paper didn't get dropped, it's an error
          SCANNER_READY_TO_EJECT: {
            target: '#rejecting',
            actions: assign({
              error: new PrecinctScannerError('paper_in_back_after_accept'),
            }),
          },
        },
      },
    },
  };

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
          entry: (context) => recordRejectedSheet(store, context),
          invoke: {
            src: reject,
            onDone: 'checking_completed',
            onError: '#jammed',
          },
        },
        // After rejecting, before the plustek grabs the paper to hold it, it sends
        // NO_PAPER status for a bit before sending READY_TO_SCAN. So we need to
        // wait for the READY_TO_SCAN.
        checking_completed: {
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: doNothing,
            SCANNER_READY_TO_SCAN: onDoneState,
            SCANNER_READY_TO_EJECT: '#jammed',
          },
          // But, if you pull the paper out right after rejecting, we go straight to
          // NO_PAPER, skipping READY_TO_SCAN completely. So we need to eventually
          // timeout waiting for READY_TO_SCAN.
          after: { DELAY_WAIT_FOR_HOLD_AFTER_REJECT: '#no_paper' },
        },
      },
    };
  }

  return createMachine<Context, Event>(
    {
      id: 'precinct_scanner',
      initial: 'connecting',
      strict: true,
      context: {},
      on: {
        SCANNER_DISCONNECTED: 'disconnected',
        SCANNER_BOTH_SIDES_HAVE_PAPER: 'both_sides_have_paper',
        SCANNER_JAM: 'jammed',
        // On unhandled commands, do nothing. This guards against any race
        // conditions where the frontend has an outdated scanner status and tries to
        // send a command.
        SCAN: doNothing,
        ACCEPT: doNothing,
        RETURN: doNothing,
        CALIBRATE: doNothing,
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
      states: {
        connecting: {
          invoke: {
            src: connectToPlustek(createPlustekClient),
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
          entry: clearLastScan,
          initial: 'waiting_to_retry_connecting',
          states: {
            waiting_to_retry_connecting: {
              after: { DELAY_RECONNECT: 'reconnecting' },
            },
            reconnecting: {
              invoke: {
                src: connectToPlustek(createPlustekClient),
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
        no_paper: {
          id: 'no_paper',
          entry: [clearError, clearLastScan],
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: doNothing,
            SCANNER_READY_TO_SCAN: 'ready_to_scan',
          },
        },
        ready_to_scan: {
          id: 'ready_to_scan',
          entry: [clearError, clearLastScan],
          invoke: pollPaperStatus,
          on: {
            SCAN: 'scanning',
            CALIBRATE: 'calibrating',
            SCANNER_NO_PAPER: 'no_paper',
            SCANNER_READY_TO_SCAN: doNothing,
          },
        },
        scanning: {
          entry: assign({ failedScanAttempts: 0 }),
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
                onError: {
                  target: 'error_scanning',
                  actions: assign((_context, event) => ({ error: event.data })),
                },
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
            // Sometimes Plustek auto-rejects the ballot without returning a scanning
            // error (e.g. if the paper is slightly mis-aligned). So we need to check
            // that the paper is still there before interpreting.
            checking_scanning_completed: {
              invoke: pollPaperStatus,
              on: {
                SCANNER_READY_TO_EJECT: '#interpreting',
                SCANNER_NO_PAPER: 'error_scanning',
                SCANNER_READY_TO_SCAN: 'error_scanning',
              },
            },
            error_scanning: {
              invoke: pollPaperStatus,
              on: {
                SCANNER_READY_TO_SCAN: [
                  // If the paper is still in the front due to an error that
                  // indicates the paper wasn't grabbed or fed through the
                  // scanner, retry (up to a certain number of attempts).
                  {
                    target: 'starting_scan',
                    cond: (context) => {
                      assert(context.failedScanAttempts !== undefined);
                      const gotExpectedScanningError =
                        context.error ===
                          ScannerError.PaperStatusErrorFeeding ||
                        context.error === ScannerError.PaperStatusNoPaper;
                      const shouldRetry =
                        (!context.error || gotExpectedScanningError) &&
                        context.failedScanAttempts <
                          MAX_FAILED_SCAN_ATTEMPTS - 1;
                      return shouldRetry;
                    },
                    actions: assign({
                      failedScanAttempts: (context) => {
                        assert(context.failedScanAttempts !== undefined);
                        return context.failedScanAttempts + 1;
                      },
                    }),
                  },
                  // Otherwise, give up and ask for the ballot to be removed.
                  {
                    target: '#rejected',
                    actions: assign({
                      error: new PrecinctScannerError('scanning_failed'),
                    }),
                  },
                ],
                SCANNER_NO_PAPER: '#no_paper',
                SCANNER_READY_TO_EJECT: '#rejecting',
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
                src: (context) => interpretSheet(interpreter, context),
                onDone: {
                  target: 'routing_result',
                  actions: assign({
                    interpretation: (_context, event) => event.data,
                  }),
                },
                onError: {
                  target: '#rejecting',
                  actions: assign((_context, event) => ({ error: event.data })),
                },
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
          on: { ACCEPT: 'accepting' },
        },
        accepting: acceptingState,
        accepted: {
          id: 'accepted',
          entry: (context) => recordAcceptedSheet(store, context),
          invoke: pollPaperStatus,
          initial: 'scanning_paused',
          on: { SCANNER_NO_PAPER: doNothing },
          states: {
            scanning_paused: {
              on: { SCANNER_READY_TO_SCAN: doNothing },
              after: {
                DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT: 'ready_for_next_ballot',
              },
            },
            ready_for_next_ballot: {
              on: { SCANNER_READY_TO_SCAN: '#ready_to_scan' },
            },
          },
          after: {
            DELAY_ACCEPTED_RESET_TO_NO_PAPER: 'no_paper',
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
        returning: { ...rejectingState('#returned') },
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
        calibrating: {
          initial: 'starting',
          states: {
            starting: {
              entry: assign({ error: undefined }),
              invoke: {
                src: calibrate,
                onDone: 'checking_completed',
                onError: {
                  target: 'checking_completed',
                  actions: assign({ error: (_context, event) => event.data }),
                },
              },
            },
            checking_completed: {
              invoke: pollPaperStatus,
              on: {
                SCANNER_NO_PAPER: '#no_paper',
                SCANNER_READY_TO_SCAN: '#ready_to_scan',
              },
            },
          },
        },
        jammed: {
          id: 'jammed',
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: 'no_paper',
            SCANNER_JAM: doNothing,
            SCANNER_READY_TO_SCAN: doNothing,
            SCANNER_READY_TO_EJECT: doNothing,
          },
        },
        both_sides_have_paper: {
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
        // If we see an unexpected error, try disconnecting from Plustek and starting over.
        error: {
          id: 'error',
          initial: 'disconnecting',
          states: {
            // First, try disconnecting the "nice" way
            disconnecting: {
              invoke: {
                src: closePlustekClient,
                onDone: 'cooling_off',
                onError: 'killing',
              },
              after: { DELAY_KILL_AFTER_DISCONNECT_TIMEOUT: 'killing' },
            },
            // If that doesn't work or takes too long, send a kill signal
            killing: {
              invoke: {
                src: killPlustekClient,
                onDone: 'cooling_off',
                onError: '#unrecoverable_error',
              },
            },
            // Now that we've disconnected, wait a bit to give Plustek time to
            // finish up anything it might be doing
            cooling_off: {
              after: { DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 'reconnecting' },
            },
            // Finally, we're ready to try reconnecting
            reconnecting: {
              invoke: {
                src: connectToPlustek(createPlustekClient),
                onDone: {
                  target: '#checking_initial_paper_status',
                  actions: assign({
                    client: (_context, event) => event.data,
                    error: undefined,
                  }),
                },
                onError: '#unrecoverable_error',
              },
            },
          },
        },
        unrecoverable_error: { id: 'unrecoverable_error' },
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
        // We only log fields that are key for understanding state
        // machine behavior, since others would be too verbose (e.g. Plustek
        // client object)
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
  return error instanceof PrecinctScannerError ? error.type : 'plustek_error';
}

/**
 * The precinct scanner state machine can:
 * - return its status
 * - accept scanning commands
 * - calibrate
 */
export interface PrecinctScannerStateMachine {
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

/**
 * Creates the state machine for the precinct scanner.
 *
 * The machine tracks the state of the precinct scanner app, which adds a layer
 * of logic for scanning and interpreting ballots on top of the Plustek scanner
 * API (which is the source of truth for the actual hardware state).
 *
 * The machine transitions between states in response to commands (e.g. scan or
 * accept) as well as in response to the paper status events from the scanner
 * (e.g. paper inserted).
 *
 * It's implemented using XState (https://xstate.js.org/docs/).
 */
export function createPrecinctScannerStateMachine(
  createPlustekClient: CreatePlustekClient,
  store: Store,
  interpreter: PrecinctScannerInterpreter,
  logger: Logger,
  delays: Partial<Delays> = {}
): PrecinctScannerStateMachine {
  const machine = buildMachine(createPlustekClient, store, interpreter, delays);
  const machineService = interpret(machine).start();
  setupLogging(machineService, logger);

  return {
    status: (): Scan.PrecinctScannerMachineStatus => {
      const { state } = machineService;
      const scannerState = (() => {
        // We use state.matches as recommended by the XState docs. This allows
        // us to add new substates to a state without breaking this switch.
        switch (true) {
          case state.matches('connecting'):
            return 'connecting';
          case state.matches('checking_initial_paper_status'):
            return 'connecting';
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
          case state.matches('returned'):
            return 'returned';
          case state.matches('rejecting'):
            return 'rejecting';
          case state.matches('rejected'):
            return 'rejected';
          case state.matches('calibrating'):
            return 'calibrating';
          case state.matches('jammed'):
            return 'jammed';
          case state.matches('both_sides_have_paper'):
            return 'both_sides_have_paper';
          case state.matches('error'):
            return 'recovering_from_error';
          case state.matches('unrecoverable_error'):
            return 'unrecoverable_error';
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

      const stateNeedsErrorDetails = [
        'rejecting',
        'rejected',
        'recovering_from_error',
        'unrecoverable_error',
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
