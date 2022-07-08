import {
  createClient,
  DEFAULT_CONFIG,
  PaperStatus,
  ScannerClient,
} from '@votingworks/plustek-sdk';
import { PageInterpretation } from '@votingworks/types';
import { assert, throwIllegalValue } from '@votingworks/utils';
import { switchMap, timer } from 'rxjs';
import {
  assign as xassign,
  Assigner,
  createMachine,
  DoneInvokeEvent,
  InvokeConfig,
  PropertyAssigner,
  send,
  TransitionsConfig,
} from 'xstate';
import { pure } from 'xstate/lib/actions';
import { SheetOf } from './types';

// Temporary mode to control how we fake interpreting ballots
export type InterpretationMode = 'valid' | 'invalid' | 'adjudicate';

export interface Context {
  client?: ScannerClient;
  ballotsCounted: number;
  scannedSheet?: SheetOf<string>;
  interpretation?: PageInterpretation;
  error?: Error;
  interpretationMode: InterpretationMode;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assign(arg: Assigner<Context, any> | PropertyAssigner<Context, any>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return xassign<Context, any>(arg);
}

export type Event =
  | { type: 'SCANNER_NO_PAPER' }
  | { type: 'SCANNER_READY_TO_SCAN' }
  | { type: 'SCANNER_READY_TO_EJECT' }
  | { type: 'SCANNER_BOTH_SIDES_HAVE_PAPER' }
  | { type: 'SCANNER_JAM' }
  | { type: 'INTERPRETATION_VALID' }
  | { type: 'INTERPRETATION_NEEDS_REVIEW' }
  | { type: 'INTERPRETATION_INVALID' }
  | { type: 'REVIEW_CAST' }
  | { type: 'REVIEW_RETURN' }
  | { type: 'SET_INTERPRETATION_MODE'; mode: InterpretationMode };

async function connectToPlustek(): Promise<ScannerClient> {
  const plustekClient = await createClient(DEFAULT_CONFIG);
  // console.log(plustekClient);
  if (plustekClient.isOk()) return plustekClient.ok();
  throw plustekClient.err();
}

function paperStatusToEventType(paperStatus: PaperStatus): Event['type'] {
  switch (paperStatus) {
    // When there's no paper in the scanner
    case PaperStatus.NoPaper:
    case PaperStatus.VtmDevReadyNoPaper:
      return 'SCANNER_NO_PAPER';
    // When there's a paper held in the front
    case PaperStatus.VtmReadyToScan:
      return 'SCANNER_READY_TO_SCAN';
    // When there's a paper held in the back
    case PaperStatus.VtmReadyToEject:
      return 'SCANNER_READY_TO_EJECT';
    // When there's a paper held in the back and inserted in the front
    case PaperStatus.VtmBothSideHavePaper:
      return 'SCANNER_BOTH_SIDES_HAVE_PAPER';
    // When there's a paper jammed in the scanner
    case PaperStatus.JamError:
    case PaperStatus.VtmFrontAndBackSensorHavePaperReady:
      return 'SCANNER_JAM';
    default:
      throw new Error(`Unexpected paper status: ${paperStatus}`);
  }
}

// Create a paper status observable, then use internal transitions to avoid
// changing state when paper status doesn't change
function paperStatusObserver({ client }: Context) {
  assert(client);
  return timer(0, 500).pipe(
    switchMap(async () => {
      const paperStatus = await client.getPaperStatus();
      if (paperStatus.isOk()) {
        // console.log(paperStatus.ok());
        return { type: paperStatusToEventType(paperStatus.ok()) };
      }
      throw paperStatus.err();
    })
  );
}

const pollPaperStatus: InvokeConfig<Context, Event> = {
  src: paperStatusObserver,
  onError: {
    target: 'error_disconnected',
    actions: assign({ error: (_, event) => event.data }),
  },
};

async function scan({ client }: Context): Promise<SheetOf<string>> {
  assert(client);
  // console.log('start scan');
  const scanResult = await client.scan({
    // shouldRetry: retryFor({ seconds: 1 }),
  });
  // console.log('scan result', scanResult);
  if (scanResult.isOk()) {
    const [front, back] = scanResult.ok().files;
    return [front, back];
  }
  throw scanResult.err();
}

// eslint-disable-next-line @typescript-eslint/require-await
async function interpretSheet({
  interpretationMode,
}: Context): Promise<PageInterpretation> {
  // console.log('interpreting', scannedSheet);
  // TODO hook up interpreter worker pool
  switch (interpretationMode) {
    case 'valid':
      return { type: 'InterpretedBmdPage' } as unknown as PageInterpretation;
    case 'invalid':
      return { type: 'UnreadablePage' };
    case 'adjudicate':
      return { type: 'BlankPage' };
    default:
      throwIllegalValue(interpretationMode);
  }
}

async function accept({ client }: Context) {
  assert(client);
  const acceptResult = await client.accept();
  // console.log('accept', acceptResult);
  if (acceptResult.isOk()) return acceptResult.ok();
  throw acceptResult.err();
}

async function reject({ client }: Context) {
  assert(client);
  const rejectResult = await client.reject({ hold: true });
  // console.log('reject', rejectResult);
  if (rejectResult.isOk()) return rejectResult.ok();
  throw rejectResult.err();
}

const onUnexpectedEvent: TransitionsConfig<Context, Event> = {
  SET_INTERPRETATION_MODE: {
    actions: assign({ interpretationMode: (_, event) => event.mode }),
  },
  '*': {
    target: '#plustek.error_unexpected_event',
    actions: assign({
      error: (_context, event) => new Error(`Unexpected event: ${event.type}`),
    }),
  },
};

export const machine = createMachine<Context, Event>({
  id: 'plustek',
  initial: 'connecting',
  strict: true,
  context: { interpretationMode: 'valid', ballotsCounted: 0 },
  on: {
    SET_INTERPRETATION_MODE: {
      actions: assign({ interpretationMode: (_, event) => event.mode }),
    },
  },
  states: {
    // TODO should we close and reconnect to plustek after every scan finishes
    // to avoid long-running process crashes?
    connecting: {
      invoke: {
        src: connectToPlustek,
        onDone: {
          target: 'checking_initial_paper_status',
          actions: assign((_context, event) => ({ client: event.data })),
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
    checking_initial_paper_status: {
      invoke: pollPaperStatus,
      on: {
        SCANNER_NO_PAPER: 'no_paper',
        SCANNER_READY_TO_SCAN: {
          target: 'rejecting',
          actions: assign({ error: new Error('Unexpected ballot in front') }),
        },
        SCANNER_READY_TO_EJECT: {
          target: 'rejecting',
          actions: assign({ error: new Error('Unexpected ballot in back') }),
        },
        SCANNER_BOTH_SIDES_HAVE_PAPER: 'error_both_sides_have_paper',
        SCANNER_JAM: 'error_jammed',
        ...onUnexpectedEvent,
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
        SCANNER_READY_TO_SCAN: 'scanning',
        ...onUnexpectedEvent,
      },
    },
    scanning: {
      entry: assign({ error: undefined }),
      invoke: {
        src: scan,
        onDone: {
          target: 'interpreting',
          actions: assign((_context, event) => ({ scannedSheet: event.data })),
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
        SCANNER_READY_TO_SCAN: 'scanning',
        SCANNER_NO_PAPER: 'no_paper',
        SCANNER_READY_TO_EJECT: 'rejecting',
        SCANNER_BOTH_SIDES_HAVE_PAPER: 'error_both_sides_have_paper',
        SCANNER_JAM: 'error_jammed',
        ...onUnexpectedEvent,
      },
    },
    interpreting: {
      invoke: {
        src: interpretSheet,
        onDone: {
          actions: [
            assign({ interpretation: (_context, event) => event.data }),
            pure((_context, event: DoneInvokeEvent<PageInterpretation>) => {
              const interpretation = event.data;
              switch (interpretation.type) {
                case 'BlankPage':
                  return send('INTERPRETATION_NEEDS_REVIEW');
                case 'InterpretedBmdPage':
                case 'InterpretedHmpbPage':
                  // TODO check for adjudication
                  return send('INTERPRETATION_VALID');
                case 'InvalidElectionHashPage':
                case 'InvalidPrecinctPage':
                case 'InvalidTestModePage':
                case 'UninterpretedHmpbPage':
                case 'UnreadablePage':
                  return send('INTERPRETATION_INVALID');
                default:
                  throwIllegalValue(interpretation, 'type');
              }
            }),
          ],
        },
        onError: {
          target: 'rejecting',
          actions: assign((_context, event) => ({ error: event.data })),
        },
      },
      on: {
        INTERPRETATION_VALID: 'accepting',
        INTERPRETATION_NEEDS_REVIEW: 'needs_review',
        INTERPRETATION_INVALID: 'rejecting',
        ...onUnexpectedEvent,
      },
    },
    accepting: {
      invoke: {
        src: accept,
        onDone: 'accepted',
        onError: {
          target: 'rejecting',
          actions: assign((_context, event) => ({ error: event.data })),
        },
      },
    },
    // TODO record the interpretation at this point?
    accepted: {
      // Delay on this state for 5s to show accepted screen, then go to no_paper
      // (unless we get a different status in the meantime, e.g. ready to scan)
      entry: assign({
        ballotsCounted: (context) => context.ballotsCounted + 1,
      }),
      after: { 5000: 'no_paper' },
      invoke: pollPaperStatus,
      on: {
        SCANNER_NO_PAPER: { target: 'accepted', internal: true },
        SCANNER_READY_TO_SCAN: 'scanning',
        // If the paper didn't get dropped, reject it
        SCANNER_READY_TO_EJECT: {
          target: 'rejecting',
          actions: assign({ error: new Error('Failed to accept') }),
        },
        // TODO we can't use onUnexpectedEvent here because it breaks the "after" transition
        // ...onUnexpectedEvent,
      },
    },
    needs_review: {
      on: {
        REVIEW_CAST: 'accepting',
        REVIEW_RETURN: 'returning',
        ...onUnexpectedEvent,
      },
    },
    returning: {
      invoke: {
        src: reject,
        onDone: 'checking_returning_completed',
        onError: 'error_jammed',
      },
    },
    // After rejecting, even though the plustek is holding the paper, it sends a
    // NO_PAPER status before sending READY_TO_SCAN. So we need to wait for the
    // READY_TO_SCAN.
    checking_returning_completed: {
      invoke: pollPaperStatus,
      on: {
        SCANNER_NO_PAPER: {
          target: 'checking_returning_completed',
          internal: true,
        },
        SCANNER_READY_TO_SCAN: 'returned',
        SCANNER_READY_TO_EJECT: 'error_jammed',
        SCANNER_JAM: 'error_jammed',
        ...onUnexpectedEvent,
      },
    },
    returned: {
      invoke: pollPaperStatus,
      on: {
        SCANNER_READY_TO_SCAN: { target: 'returned', internal: true },
        SCANNER_NO_PAPER: 'no_paper',
        ...onUnexpectedEvent,
      },
    },
    rejecting: {
      invoke: {
        src: reject,
        onDone: 'checking_rejecting_completed',
        onError: 'error_jammed',
      },
    },
    // After rejecting, even though the plustek is holding the paper, it sends a
    // NO_PAPER status before sending READY_TO_SCAN. So we need to wait for the
    // READY_TO_SCAN.
    checking_rejecting_completed: {
      invoke: pollPaperStatus,
      on: {
        SCANNER_NO_PAPER: {
          target: 'checking_rejecting_completed',
          internal: true,
        },
        SCANNER_READY_TO_SCAN: 'rejected',
        SCANNER_READY_TO_EJECT: 'error_jammed',
        SCANNER_JAM: 'error_jammed',
        ...onUnexpectedEvent,
      },
    },
    // Paper has been rejected and is held in the front, waiting for removal.
    rejected: {
      invoke: pollPaperStatus,
      on: {
        SCANNER_READY_TO_SCAN: { target: 'rejected', internal: true },
        SCANNER_NO_PAPER: 'no_paper',
        ...onUnexpectedEvent,
      },
    },
    error_jammed: {
      invoke: pollPaperStatus,
      on: {
        SCANNER_NO_PAPER: 'no_paper',
        '*': { target: 'error_jammed', internal: true },
      },
    },
    error_both_sides_have_paper: {
      invoke: pollPaperStatus,
      on: {
        SCANNER_BOTH_SIDES_HAVE_PAPER: {
          target: 'error_both_sides_have_paper',
          internal: true,
        },
        // For now, if the front paper is removed, just reject the back paper,
        // since we don't have context on how we got here and what was supposed
        // to happen.
        SCANNER_READY_TO_EJECT: {
          target: 'rejecting',
          actions: assign({
            error: new Error('Detected paper in front and back'),
          }),
        },
        ...onUnexpectedEvent,
      },
    },
    error_unexpected_event: {},
  },
});
