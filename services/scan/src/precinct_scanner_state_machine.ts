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
import { switchMap, timeout, timer } from 'rxjs';
import {
  assign as xassign,
  Assigner,
  createMachine,
  interpret,
  Interpreter,
  InvokeConfig,
  PropertyAssigner,
} from 'xstate';
import { Scan } from '@votingworks/api';
import makeDebug from 'debug';
import { waitFor } from 'xstate/lib/waitFor';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  SheetInterpretation,
  SimpleInterpreter,
  storeAcceptedSheet,
  storeRejectedSheet,
} from './simple_interpreter';
import { SheetOf } from './types';
import { Store } from './store';

const PAPER_STATUS_POLLING_INTERVAL = 500;
const PAPER_STATUS_POLLING_TIMEOUT = 5_000;

// 10 attempts is about the amount of time it takes for Plustek to stop trying
// to grab the paper. Up until that point, if you reposition the paper so the
// rollers grab it, it will get scanned successfully.
export const MAX_FAILED_SCAN_ATTEMPTS = 10;

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
  error?: Error | ScannerError;
  interpretationMode: InterpretationMode;
  failedScanAttempts?: number;
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

type CommandEvent =
  | { type: 'SCAN' }
  | { type: 'ACCEPT' }
  | { type: 'RETURN' }
  | { type: 'CALIBRATE' };

export type Event =
  | ScannerStatusEvent
  | CommandEvent
  | ConfigurationEvent
  | { type: 'SET_INTERPRETATION_MODE'; mode: InterpretationMode };

export interface Delays {
  DELAY_RECONNECT: number;
  DELAY_RECONNECT_ON_UNEXPECTED_ERROR: number;
  DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT: number;
  DELAY_ACCEPTED_RESET_TO_NO_PAPER: number;
  DELAY_SCANNING_TIMEOUT: number;
}

function connectToPlustek(createPlustekClient: CreatePlustekClient) {
  return async (): Promise<ScannerClient> => {
    debug('Connecting to plustek');
    const plustekClient = await createPlustekClient(DEFAULT_CONFIG);
    debug('Plustek client connected: %s', plustekClient.isOk());
    return plustekClient.unsafeUnwrap();
  };
}

async function disconnectFromPlustek({ client }: Context) {
  assert(client);
  debug('Disconnecting from plustek');
  await client.close();
  debug('Plustek client disconnected');
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
    }),
    timeout(PAPER_STATUS_POLLING_TIMEOUT)
  );
}

const pollPaperStatus: InvokeConfig<Context, Event> = {
  src: paperStatusObserver,
  onError: {
    target: '#error',
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

function recordAcceptedSheet({ store, interpretation }: Context) {
  assert(store);
  assert(interpretation);
  const { sheetId } = interpretation;
  storeAcceptedSheet(store, sheetId, interpretation);
  debug('Stored accepted sheet: %s', sheetId);
}

function recordRejectedSheet({ store, interpretation }: Context) {
  assert(store);
  if (!interpretation) return;
  const { sheetId } = interpretation;
  storeRejectedSheet(store, sheetId, interpretation);
  debug('Stored rejected sheet: %s', sheetId);
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

const clearError = assign({
  error: undefined,
});

function buildMachine(createPlustekClient: CreatePlustekClient) {
  return createMachine<Context, Event>(
    {
      id: 'precinct_scanner',
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
          id: 'checking_initial_paper_status',
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: 'no_paper',
            SCANNER_READY_TO_SCAN: {
              target: 'rejected',
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
          id: 'no_paper',
          entry: [clearError, clearLastScan],
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: { target: 'no_paper', internal: true },
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
            SCANNER_READY_TO_SCAN: { target: 'ready_to_scan', internal: true },
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
            // If scanning fails, we should retry if the paper is still ready to be
            // scanned and scanning failed for a known reason. We only retry up to a
            // certain number of attempts.
            error_scanning: {
              entry: assign({
                failedScanAttempts: (context) => {
                  assert(context.failedScanAttempts !== undefined);
                  return context.failedScanAttempts + 1;
                },
              }),
              always: {
                target: '#rejected',
                actions: assign({
                  error: new PrecinctScannerError('scanning_failed'),
                }),
                cond: (context) => {
                  assert(context.failedScanAttempts !== undefined);
                  const gotExpectedScanningError =
                    context.error === ScannerError.PaperStatusErrorFeeding ||
                    context.error === ScannerError.PaperStatusNoPaper;
                  const shouldRetry =
                    (!context.error || gotExpectedScanningError) &&
                    context.failedScanAttempts < MAX_FAILED_SCAN_ATTEMPTS;
                  return !shouldRetry;
                },
              },
              invoke: pollPaperStatus,
              on: {
                SCANNER_READY_TO_SCAN: 'starting_scan',
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
                src: interpretSheet,
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
        accepting: {
          invoke: {
            src: accept,
            onDone: 'checking_accepting_completed',
            // In some cases, Plustek can return an error even if the paper got
            // accepted, so we need to check paper status to determine what to do
            // next. We still record the error for debugging purposes.
            onError: {
              target: 'checking_accepting_completed',
              actions: assign({ error: (_context, event) => event.data }),
            },
          },
        },
        checking_accepting_completed: {
          invoke: pollPaperStatus,
          on: {
            SCANNER_NO_PAPER: 'accepted',
            // If there's a paper in front, that means the ballot in back did get
            // dropped but somebody quickly inserted a new ballot in front, so we
            // should count the first ballot as accepted.
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
          entry: recordAcceptedSheet,
          invoke: pollPaperStatus,
          initial: 'scanning_paused',
          on: { SCANNER_NO_PAPER: { target: undefined } }, // Do nothing
          states: {
            scanning_paused: {
              on: { SCANNER_READY_TO_SCAN: { target: undefined } }, // Do nothing
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
            ACCEPT: 'accepting',
            RETURN: 'returning',
            SCANNER_READY_TO_EJECT: { target: undefined }, // Do nothing
          },
        },
        returning: {
          entry: recordRejectedSheet,
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
          entry: recordRejectedSheet,
          id: 'rejecting',
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
          id: 'rejected',
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
          entry: clearError,
          invoke: pollPaperStatus,
          on: {
            SCANNER_BOTH_SIDES_HAVE_PAPER: { target: undefined }, // Do nothing
            // Sometimes we get a no_paper blip when removing the front paper quickly
            SCANNER_NO_PAPER: { target: undefined }, // Do nothing
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
          invoke: { src: disconnectFromPlustek, onDone: {}, onError: {} },
          initial: 'cooling_off',
          states: {
            cooling_off: {
              after: { DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 'reconnecting' },
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
                onError: 'failed_reconnecting',
              },
            },
            failed_reconnecting: {},
          },
        },
      },
    },
    {
      delays: {
        // When disconnected, how long to wait before trying to reconnect.
        DELAY_RECONNECT: 500,
        // When we run into an unexpected error (e.g. unexpected paper status),
        // how long to wait before trying to reconnect. This should be pretty
        // long in order to let Plustek finish whatever it's doing (yes, even
        // after disconnecting, Plustek might keep scanning).
        DELAY_RECONNECT_ON_UNEXPECTED_ERROR: 5_000,
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
      },
    }
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
      await logger.log(LogEventId.ScannerEvent, 'system', {
        message: `Event: ${event.type}`,
      });
      debugEvents('Event: %s', event);
    })
    .onChange(async (context, previousContext) => {
      if (!previousContext) return;
      const changed = Object.entries(context).filter(
        ([key, value]) => previousContext[key as keyof Context] !== value
      );
      if (changed.length === 0) return;
      debug('Context updated: %o', Object.fromEntries(changed));
      // In prod, we only log fields that are key for understanding state
      // machine behavior, since others would be too verbose (e.g. Plustek
      // client object)
      const changedToLog = changed
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

      if (changedToLog.length === 0) return;
      await logger.log(LogEventId.ScannerStateChanged, 'system', {
        message: `Context updated`,
        changedFields: JSON.stringify(Object.fromEntries(changedToLog)),
      });
    })
    .onTransition(async (state) => {
      if (!state.changed) return;
      await logger.log(LogEventId.ScannerStateChanged, 'system', {
        message: `Transitioned to: ${JSON.stringify(state.value)}`,
      });
      debug('Transitioned to: %s', state.value);
    });
}

function errorToString(error: NonNullable<Context['error']>) {
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
  logger: Logger,
  delays: Partial<Delays> = {}
): PrecinctScannerStateMachine {
  const machine = buildMachine(createPlustekClient).withConfig({ delays });
  const machineService = interpret(machine).start();
  setupLogging(machineService, logger);

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
        error:
          ['rejecting', 'rejected', 'error'].includes(scannerState) && error
            ? errorToString(error)
            : undefined,
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
