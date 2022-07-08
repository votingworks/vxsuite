import {
  createClient,
  DEFAULT_CONFIG,
  PaperStatus,
  ScannerClient,
} from '@votingworks/plustek-sdk';
import { PageInterpretation } from '@votingworks/types';
import { assert, throwIllegalValue } from '@votingworks/utils';
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

// type ScannerError =
//   | { message: 'both_sides_have_paper' }
//   | { message: 'jammed' }
//   | { message: 'scanning_error'; details: Error }
//   | { message: 'interpreting_error'; details: Error }
//   | { message: 'accepting_error'; details: Error }
//   | { message: 'rejecting_error'; details: Error }
//   | { message: 'unexpected_event'; event: Event };

export interface Context {
  client?: ScannerClient;
  scannedSheet?: SheetOf<string>;
  interpretation?: PageInterpretation;
  error?: Error;
}

function assign(arg: Assigner<Context, any> | PropertyAssigner<Context, any>) {
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
  | { type: 'REVIEW_ACCEPTED' }
  | { type: 'REVIEW_REJECTED' }
  | { type: 'RESET' };

async function connectToPlustek(): Promise<ScannerClient> {
  const plustekClient = await createClient(DEFAULT_CONFIG);
  if (plustekClient.isOk()) return plustekClient.ok();
  throw plustekClient.err();
}

// TODO it's possible to get a "no paper" status when a paper is jammed in the back after scanning
// Need to repro this and handle
function paperStatusToEventType(paperStatus: PaperStatus): Event['type'] {
  switch (paperStatus) {
    // When there's no paper in the scanner
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
    case PaperStatus.VtmFrontAndBackSensorHavePaperReady:
      return 'SCANNER_JAM';
    default:
      throw new Error(`Unexpected paper status: ${paperStatus}`);
  }
}

const pollPaperStatus: InvokeConfig<Context, Event> = {
  src:
    ({ client }: Context) =>
    (callback) => {
      assert(client);
      const interval = setInterval(async () => {
        const paperStatus = await client.getPaperStatus();
        if (paperStatus.isOk()) {
          return callback(paperStatusToEventType(paperStatus.ok()));
        }
        throw paperStatus.err();
      }, 1000);
      return () => clearInterval(interval);
    },
};

async function scan({ client }: Context): Promise<SheetOf<string>> {
  assert(client);
  const scanResult = await client.scan();
  console.log('scan', scanResult);
  if (scanResult.isOk()) {
    const [front, back] = scanResult.ok().files;
    return [front, back];
  }
  throw scanResult.err();
}

// eslint-disable-next-line @typescript-eslint/require-await
async function interpretSheet({
  scannedSheet,
}: Context): Promise<PageInterpretation> {
  // console.log('interpreting', scannedSheet);
  // TODO hook up interpreter worker pool
  // return { type: 'BlankPage' };
  return { type: 'InterpretedBmdPage' };
}

async function accept({ client }: Context) {
  assert(client);
  const acceptResult = await client.accept();
  console.log('accept', acceptResult);
  if (acceptResult.isOk()) return acceptResult.ok();
  throw acceptResult.err();
}

async function reject({ client }: Context) {
  assert(client);
  const rejectResult = await client.reject({ hold: true });
  console.log('reject', rejectResult);
  if (rejectResult.isOk()) return rejectResult.ok();
  throw rejectResult.err();
}

const onUnexpectedEvent: TransitionsConfig<Context, Event> = {
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
  context: { client: undefined },
  states: {
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
    checking_initial_paper_status: {
      invoke: pollPaperStatus,
      on: {
        SCANNER_NO_PAPER: 'no_paper',
        // TODO Should just start scanning?
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
      entry: assign({ error: undefined }),
      invoke: pollPaperStatus,
      on: {
        SCANNER_NO_PAPER: 'no_paper',
        SCANNER_READY_TO_SCAN: 'scanning',
        ...onUnexpectedEvent,
      },
    },
    scanning: {
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
                  // TODO check for adjudication?
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
    accepted: {
      // TODO should we record the interpretation at this point?
      entry: assign(() => ({
        scannedSheet: undefined,
        interpretation: undefined,
      })),
      invoke: pollPaperStatus,
      // Delay on this state for 5s to show accepted screen, then go to no_paper
      // (unless we get a different status in the meantime, e.g. ready to scan)
      after: {
        5000: 'checking_initial_paper_status',
      },
      on: {
        SCANNER_NO_PAPER: 'accepted',
        SCANNER_READY_TO_SCAN: 'scanning',
        // If the paper didn't get dropped, reject it
        SCANNER_READY_TO_EJECT: {
          target: 'rejecting',
          actions: assign({ error: new Error('Failed to accept') }),
        },
        ...onUnexpectedEvent,
      },
    },
    needs_review: {
      // TODO do we need a way to flag that the user requested the ballot to be
      // returned so we can show a nice message?
      on: {
        REVIEW_ACCEPTED: 'accepting',
        REVIEW_REJECTED: 'rejecting',
        ...onUnexpectedEvent,
      },
    },
    rejecting: {
      invoke: {
        src: reject,
        onDone: 'rejected',
        onError: 'error_jammed',
      },
    },
    rejected: {
      invoke: pollPaperStatus,
      on: {
        SCANNER_READY_TO_SCAN: 'rejected',
        SCANNER_NO_PAPER: 'no_paper',
        SCANNER_READY_TO_EJECT: 'error_jammed',
        SCANNER_JAM: 'error_jammed',
        ...onUnexpectedEvent,
      },
    },
    error_scanning: {
      invoke: pollPaperStatus,
      on: {
        SCANNER_READY_TO_EJECT: 'rejecting',
        SCANNER_READY_TO_SCAN: 'rejecting',
        SCANNER_NO_PAPER: 'no_paper',
        SCANNER_BOTH_SIDES_HAVE_PAPER: 'error_both_sides_have_paper',
        SCANNER_JAM: 'error_jammed',
      },
    },
    error_jammed: {
      invoke: pollPaperStatus,
      on: {
        SCANNER_NO_PAPER: 'no_paper',
        ...onUnexpectedEvent,
      },
    },
    error_both_sides_have_paper: {
      invoke: pollPaperStatus,
      on: {
        // For now, if the front paper is removed, just reject the back paper,
        // since we don't have context on what was supposed to happen
        SCANNER_READY_TO_EJECT: {
          target: 'rejecting',
          actions: assign({
            error: new Error('Detected paper in front and back'),
          }),
        },
        ...onUnexpectedEvent,
      },
    },
    // TODO only retry connecting a fixed number of times
    error_disconnected: {
      entry: send('RESET'),
      on: { RESET: 'connecting' },
    },
    error_unexpected_event: {},
  },
});

// const service = interpretMachine(machine).onTransition((state) => {
//   const { error } = state.context;
//   console.log('Transitioned to:', state.value);
//   if (error) {
//     console.error('Error:', error.message);
//   }
// });

// service.start();
