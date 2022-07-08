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
  interpret as interpretMachine,
} from 'xstate';
import { pure } from 'xstate/lib/actions';
import { SheetOf } from './types';

type ScannerError =
  | { message: 'both_sides_have_paper' }
  | { message: 'jammed' }
  | { message: 'scanning_error' }
  | { message: 'interpreting_error' }
  | { message: 'accepting_error' }
  | { message: 'rejecting_error' }
  | { message: 'unexpected_event'; event: Event };

export interface Context {
  client?: ScannerClient;
  scannedSheet?: SheetOf<string>;
  interpretation?: PageInterpretation;
  error?: ScannerError;
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
  | { type: 'REVIEW_REJECTED' };

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
  if (acceptResult.isOk()) return acceptResult.ok();
  throw acceptResult.err();
}

async function reject({ client }: Context) {
  assert(client);
  const rejectResult = await client.reject({ hold: false });
  if (rejectResult.isOk()) return rejectResult.ok();
  throw rejectResult.err();
}

const onUnexpectedEvent: TransitionsConfig<Context, Event> = {
  '*': {
    target: 'error',
    actions: (_context, event) =>
      assign({ error: { message: 'unexpected_event', event } }),
  },
};

function transitionToErrorState(error: ScannerError) {
  return {
    target: 'error',
    actions: assign({ error }),
  };
}

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
        onError: { target: 'error' },
      },
    },
    checking_initial_paper_status: {
      invoke: pollPaperStatus,
      on: {
        SCANNER_NO_PAPER: 'no_paper',
        SCANNER_READY_TO_SCAN: 'rejecting',
        SCANNER_READY_TO_EJECT: 'rejecting',
        SCANNER_BOTH_SIDES_HAVE_PAPER: transitionToErrorState({
          message: 'both_sides_have_paper',
        }),
        SCANNER_JAM: transitionToErrorState({ message: 'jammed' }),
        ...onUnexpectedEvent,
      },
    },
    no_paper: {
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
        onError: transitionToErrorState({ message: 'scanning_error' }),
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
        onError: transitionToErrorState({ message: 'interpreting_error' }),
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
        onDone: { target: 'accepted' },
        onError: transitionToErrorState({ message: 'accepting_error' }),
      },
    },
    accepted: {
      invoke: pollPaperStatus,
      on: {
        SCANNER_NO_PAPER: { target: 'no_paper', actions: assign(() => ({})) },
        SCANNER_READY_TO_EJECT: transitionToErrorState({
          message: 'accepting_error',
        }),
        ...onUnexpectedEvent,
      },
    },
    needs_review: {
      on: { REVIEW_ACCEPTED: 'accepting', REVIEW_REJECTED: 'rejecting' },
    },
    rejecting: {
      invoke: {
        src: reject,
        onDone: { target: 'rejected' },
        onError: transitionToErrorState({ message: 'rejecting_error' }),
      },
    },
    // TODO do we need a timeout after rejecting to go back to no_paper?
    rejected: {
      invoke: pollPaperStatus,
      on: {
        SCANNER_NO_PAPER: 'no_paper',
        SCANNER_READY_TO_EJECT: transitionToErrorState({
          message: 'rejecting_error',
        }),
        SCANNER_JAM: transitionToErrorState({ message: 'jammed' }),
        ...onUnexpectedEvent,
      },
    },
    error: {},
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
