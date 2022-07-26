import {
  ClientDisconnectedError,
  createClient,
  DEFAULT_CONFIG,
  PaperStatus,
  ScannerClient,
  ScannerError,
} from '@votingworks/plustek-sdk';
import { v4 as uuid } from 'uuid';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  Id,
  PageInterpretationWithFiles,
} from '@votingworks/types';
import { assert } from '@votingworks/utils';
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
import {
  deleteInterpretedSheet,
  SimpleInterpreter,
  storeInterpretedSheet,
} from './simple_interpreter';
import { SheetOf } from './types';
import { Store } from './store';

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

export interface Context {
  store?: Store;
  interpreter?: SimpleInterpreter;
  client?: ScannerClient;
  scannedSheet?: SheetOf<string>;
  interpretation?: InterpretationResultEvent;
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

interface Interpretation {
  sheetId: Id;
  sheet: SheetOf<PageInterpretationWithFiles>;
}

export type InterpretationResultEvent = Scan.InterpretationResult & {
  interpretation: Interpretation;
};

type CommandEvent =
  | { type: 'SCAN' }
  | { type: 'ACCEPT' }
  | { type: 'RETURN' }
  | { type: 'WAIT_FOR_PAPER' }
  | { type: 'CALIBRATE' };

export type Event =
  | ScannerStatusEvent
  | InterpretationResultEvent
  | CommandEvent
  | ConfigurationEvent
  | { type: 'SET_INTERPRETATION_MODE'; mode: InterpretationMode };

async function connectToPlustek(): Promise<ScannerClient> {
  debug('Connecting to plustek');
  const plustekClient = await createClient(DEFAULT_CONFIG);
  debug('Plustek client connected: %s', plustekClient.isOk());
  return plustekClient.unsafeUnwrap();
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
  return timer(0, 500).pipe(
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
}: Context): Promise<InterpretationResultEvent> {
  assert(interpreter);
  assert(scannedSheet);

  if (interpretationMode === 'skip') {
    return {
      type: 'INTERPRETATION_VALID',
      interpretation: {
        sheetId: 'mock-sheet-id',
        sheet: [
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
      },
    };
  }

  const sheetId = uuid();
  const result = await interpreter.interpret(sheetId, scannedSheet);
  const interpretedSheet = result.unsafeUnwrap();
  const [front, back] = interpretedSheet;
  const frontType = front.interpretation.type;
  const backType = back.interpretation.type;
  const interpretation: Interpretation = { sheetId, sheet: interpretedSheet };

  if (
    frontType === 'InvalidElectionHashPage' ||
    backType === 'InvalidElectionHashPage'
  ) {
    return {
      type: 'INTERPRETATION_INVALID',
      interpretation,
      reason: 'invalid_election_hash',
    };
  }

  if (
    frontType === 'InvalidTestModePage' ||
    backType === 'InvalidTestModePage'
  ) {
    return {
      type: 'INTERPRETATION_INVALID',
      interpretation,
      reason: 'invalid_test_mode',
    };
  }

  if (
    frontType === 'InvalidPrecinctPage' ||
    backType === 'InvalidPrecinctPage'
  ) {
    return {
      type: 'INTERPRETATION_INVALID',
      interpretation,
      reason: 'invalid_precinct',
    };
  }

  if (frontType === 'UnreadablePage' || backType === 'UnreadablePage') {
    return {
      type: 'INTERPRETATION_INVALID',
      interpretation,
      reason: 'unreadable',
    };
  }

  // TODO what does this case actually mean?
  if (
    frontType === 'UninterpretedHmpbPage' ||
    backType === 'UninterpretedHmpbPage'
  ) {
    return {
      type: 'INTERPRETATION_INVALID',
      interpretation,
      reason: 'unknown',
    };
  }

  if (frontType === 'InterpretedBmdPage' || backType === 'InterpretedBmdPage') {
    return { type: 'INTERPRETATION_VALID', interpretation };
  }

  assert(
    frontType === 'InterpretedHmpbPage' && backType === 'InterpretedHmpbPage'
  );
  const frontAdjudication = front.interpretation.adjudicationInfo;
  const backAdjudication = back.interpretation.adjudicationInfo;

  if (
    frontAdjudication.requiresAdjudication ||
    backAdjudication.requiresAdjudication
  ) {
    const frontReasons = frontAdjudication.enabledReasonInfos;
    const backReasons = backAdjudication.enabledReasonInfos;

    let reasons: AdjudicationReasonInfo[];
    // If both sides are blank, the ballot is blank
    if (
      frontReasons.length === 1 &&
      frontReasons[0].type === AdjudicationReason.BlankBallot &&
      backReasons.length === 1 &&
      backReasons[0].type === AdjudicationReason.BlankBallot
    ) {
      reasons = [{ type: AdjudicationReason.BlankBallot }];
    }
    // Otherwise, we can ignore blank sides
    else {
      reasons = [...frontReasons, ...backReasons].filter(
        (reason) => reason.type !== AdjudicationReason.BlankBallot
      );
    }

    // If there are any non-blank reasons, they should be reviewed
    if (reasons.length > 0) {
      return {
        type: 'INTERPRETATION_NEEDS_REVIEW',
        interpretation,
        reasons,
      };
    }
  }

  return {
    type: 'INTERPRETATION_VALID',
    interpretation,
  };
}

async function accept({ client, store, interpretation }: Context) {
  assert(store);
  assert(client);
  assert(interpretation);
  // Optimistically record the interpretation in the store. If accept fails
  // (e.g. due to paper jam), we delete the interpretation from the store. If
  // the Plustek crashes during accept, it will automatically accept on reboot.
  const { sheetId, sheet } = interpretation.interpretation;
  storeInterpretedSheet(store, sheetId, sheet);
  debug('Stored sheet before accepting: %s', sheetId);
  debug('Accepting');
  const acceptResult = await client.accept();
  debug('Accept result: %o', acceptResult);
  return acceptResult.unsafeUnwrap();
}

function deleteLastAcceptedBallot({ store, interpretation }: Context) {
  assert(store);
  assert(interpretation);
  const { sheetId } = interpretation.interpretation;
  deleteInterpretedSheet(store, sheetId);
  debug('Deleted last accepted sheet: %s', sheetId);
}

async function reject({ client }: Context) {
  assert(client);
  debug('Rejecting');
  const rejectResult = await client.reject({ hold: true });
  debug('Reject result: %o', rejectResult);
  return rejectResult.unsafeUnwrap();
}

export const machine = createMachine<Context, Event>({
  id: 'plustek',
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
    SET_INTERPRETATION_MODE: {
      actions: assign({ interpretationMode: (_, event) => event.mode }),
    },
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
        src: connectToPlustek,
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
      after: { 500: 'reconnecting' },
    },
    reconnecting: {
      invoke: {
        src: connectToPlustek,
        onDone: {
          target: 'checking_initial_paper_status',
          actions: assign({ client: (_context, event) => event.data }),
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
      entry: assign({
        error: undefined,
        scannedSheet: undefined,
        interpretation: undefined,
      }),
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
            send((_context, event) => event.data),
          ],
        },
        onError: {
          target: 'rejecting',
          actions: assign((_context, event) => ({ error: event.data })),
        },
      },
      on: {
        INTERPRETATION_VALID: 'ready_to_accept',
        INTERPRETATION_NEEDS_REVIEW: 'needs_review',
        INTERPRETATION_INVALID: 'rejecting',
      },
    },
    ready_to_accept: {
      on: { ACCEPT: 'accepting' },
    },
    accepting: {
      invoke: {
        src: accept,
        onDone: 'accepted',
        onError: {
          target: 'error_accepting',
          actions: assign({ error: (_context, event) => event.data }),
        },
      },
    },
    accepted: {
      invoke: pollPaperStatus,
      on: {
        WAIT_FOR_PAPER: 'no_paper',
        SCANNER_NO_PAPER: { target: 'accepted', internal: true },
        SCANNER_READY_TO_SCAN: 'ready_to_scan',
        // If the paper didn't get dropped, it's an error
        SCANNER_READY_TO_EJECT: 'error_accepting',
      },
    },
    // If accepting fails, reject the ballot and "uncount" it
    error_accepting: {
      entry: deleteLastAcceptedBallot,
      always: 'rejecting',
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
      after: { 1000: 'no_paper' },
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
      after: { 1000: 'no_paper' },
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
        onDone: 'calibrated',
        onError: {
          target: 'calibrated',
          actions: assign({ error: (_context, event) => event.data }),
        },
      },
    },
    calibrated: {
      on: {
        WAIT_FOR_PAPER: 'no_paper',
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
});

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
  waitForPaper: () => void;
  calibrate: () => void;
}

export function createPrecinctScannerStateMachine(): PrecinctScannerStateMachine {
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
          case state.matches('error_accepting'):
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
      // TODO log any errors, especially unexpected paper status/event or other unexpected errors
      return {
        state: scannerState,
        interpretation,
        error:
          error &&
          (error instanceof PrecinctScannerError
            ? error.type
            : 'plustek_error'),
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

    waitForPaper: () => {
      machineService.send('WAIT_FOR_PAPER');
    },

    calibrate: () => {
      machineService.send('CALIBRATE');
    },
  };
}
