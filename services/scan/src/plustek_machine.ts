import {
  createClient,
  DEFAULT_CONFIG,
  PaperStatus,
  ScannerClient,
} from '@votingworks/plustek-sdk';
import { v4 as uuid } from 'uuid';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  PageInterpretation,
  PageInterpretationWithFiles,
} from '@votingworks/types';
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
import { electionSampleNoSealDefinition as electionDefinition } from '@votingworks/fixtures';
import { SCAN_WORKSPACE } from './globals';
import {
  createInterpreter,
  loadLayouts,
  SimpleInterpreter,
} from './simple_interpreter';
import { SheetOf } from './types';
import { createWorkspace } from './util/workspace';
import { DefaultMarkThresholds } from './store';

// Temporary mode to control how we fake interpreting ballots
export type InterpretationMode = 'valid' | 'invalid' | 'adjudicate';

export interface Context {
  interpreter?: SimpleInterpreter;
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

type InvalidInterpretationReason =
  | 'invalid_test_mode'
  | 'invalid_election_hash'
  | 'invalid_precinct'
  | 'unreadable'
  | 'unknown';

type ScannerStatusEvent =
  | { type: 'SCANNER_NO_PAPER' }
  | { type: 'SCANNER_READY_TO_SCAN' }
  | { type: 'SCANNER_READY_TO_EJECT' }
  | { type: 'SCANNER_BOTH_SIDES_HAVE_PAPER' }
  | { type: 'SCANNER_JAM' };

type InterpretationResultEvent =
  | {
      type: 'INTERPRETATION_VALID';
      interpretation: SheetOf<PageInterpretationWithFiles>;
    }
  | {
      type: 'INTERPRETATION_INVALID';
      interpretation: SheetOf<PageInterpretationWithFiles>;
      reason: InvalidInterpretationReason;
    }
  | {
      type: 'INTERPRETATION_NEEDS_REVIEW';
      interpretation: SheetOf<PageInterpretationWithFiles>;
      reasons: AdjudicationReasonInfo[];
    };

type CommandEvent = { type: 'SCAN' } | { type: 'ACCEPT' } | { type: 'RETURN' };

export type Event =
  | ScannerStatusEvent
  | InterpretationResultEvent
  | CommandEvent
  | { type: 'SET_INTERPRETATION_MODE'; mode: InterpretationMode };

async function configureInterpreter(): Promise<SimpleInterpreter> {
  assert(SCAN_WORKSPACE !== undefined);
  electionDefinition.election = {
    ...electionDefinition.election,
    markThresholds: DefaultMarkThresholds,
  };
  const workspace = await createWorkspace(SCAN_WORKSPACE);
  workspace.store.setElection(electionDefinition);
  const layouts = await loadLayouts(workspace.store);
  console.log({ layouts });
  assert(layouts);
  return createInterpreter({
    electionDefinition,
    ballotImagesPath: workspace.ballotImagesPath,
    testMode: false,
    layouts,
  });
}

async function connectToPlustek(): Promise<ScannerClient> {
  const plustekClient = await createClient(DEFAULT_CONFIG);
  // console.log(plustekClient);
  if (plustekClient.isOk()) return plustekClient.ok();
  throw plustekClient.err();
}

function paperStatusToEvent(paperStatus: PaperStatus): ScannerStatusEvent {
  switch (paperStatus) {
    // When there's no paper in the scanner
    case PaperStatus.NoPaper:
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
    case PaperStatus.JamError:
    case PaperStatus.VtmFrontAndBackSensorHavePaperReady:
      return { type: 'SCANNER_JAM' };
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
        return paperStatusToEvent(paperStatus.ok());
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
  interpreter,
  scannedSheet,
}: // interpretationMode,
Context): Promise<InterpretationResultEvent> {
  assert(interpreter);
  assert(scannedSheet);
  const sheetId = uuid();
  const result = await interpreter.interpret(sheetId, scannedSheet);
  const interpretation = result.unsafeUnwrap();
  const [front, back] = interpretation;
  const frontType = front.interpretation.type;
  const backType = back.interpretation.type;

  if (frontType === 'BlankPage' && backType === 'BlankPage') {
    return {
      type: 'INTERPRETATION_NEEDS_REVIEW',
      interpretation,
      reasons: [{ type: AdjudicationReason.BlankBallot }],
    };
  }

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
    return {
      type: 'INTERPRETATION_NEEDS_REVIEW',
      interpretation,
      reasons: [
        ...frontAdjudication.enabledReasonInfos,
        ...backAdjudication.enabledReasonInfos,
      ],
    };
  }

  return {
    type: 'INTERPRETATION_VALID',
    interpretation,
  };

  // console.log('interpreting', scannedSheet);
  // TODO hook up interpreter worker pool
  // switch (interpretationMode) {
  //   case 'valid':
  //     return { type: 'InterpretedBmdPage' } as unknown as PageInterpretation;
  //   case 'invalid':
  //     return { type: 'UnreadablePage' };
  //   case 'adjudicate':
  //     return { type: 'BlankPage' };
  //   default:
  //     throwIllegalValue(interpretationMode);
  // }
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
  initial: 'configuring_interpreter',
  strict: true,
  context: { interpretationMode: 'valid', ballotsCounted: 0 },
  on: {
    SET_INTERPRETATION_MODE: {
      actions: assign({ interpretationMode: (_, event) => event.mode }),
    },
  },
  states: {
    configuring_interpreter: {
      invoke: {
        src: configureInterpreter,
        onDone: {
          target: 'connecting',
          actions: assign({ interpreter: (_, event) => event.data }),
        },
        onError: {
          actions: assign({
            error: (_context, event) => {
              console.log(event.data);
              return event.data;
            },
          }),
        },
      },
    },
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
        SCANNER_READY_TO_SCAN: 'ready_to_scan',
        ...onUnexpectedEvent,
      },
    },
    ready_to_scan: {
      on: { SCAN: 'scanning' },
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
        SCANNER_READY_TO_SCAN: 'ready_to_scan',
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
        INTERPRETATION_VALID: 'ready_to_accept',
        INTERPRETATION_NEEDS_REVIEW: 'needs_review',
        INTERPRETATION_INVALID: 'rejecting',
        ...onUnexpectedEvent,
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
        SCANNER_READY_TO_SCAN: 'ready_to_scan',
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
        ACCEPT: 'accepting',
        RETURN: 'returning',
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
