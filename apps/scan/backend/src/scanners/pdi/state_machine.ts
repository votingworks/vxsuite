import { sleep, throwIllegalValue } from '@votingworks/basics';
import {
  ScannerClient,
  ScannerEvent,
  ScannerStatus,
  createPdiScannerClient,
} from '@votingworks/pdi-scanner';
import assert from 'assert';
import {
  InvokeConfig,
  assign,
  createMachine,
  interpret as interpretStateMachine,
  sendParent,
} from 'xstate';

interface Context {
  client: ScannerClient;
  error?: Error;
}

type Event =
  | {
      type: 'STATUS';
      status: ScannerStatus;
    }
  | {
      type: 'EVENT';
      event: ScannerEvent;
    };

const pollScannerStatusMachine = createMachine<
  Pick<Context, 'client'>,
  Extract<Event, { type: 'STATUS' }>
>({
  id: 'poll_scanner_status',
  initial: 'getting_status',
  states: {
    getting_status: {
      invoke: {
        src: async ({ client }) =>
          (await client.getScannerStatus()).unsafeUnwrap(),
        onDone: {
          target: 'delaying',
          actions: sendParent((_, event) => ({
            type: 'STATUS',
            status: event.data,
          })),
        },
      },
    },
    delaying: {
      after: {
        1000: 'getting_status',
      },
    },
  },
});

const pollScannerStatus: InvokeConfig<Context, Event> = {
  src: pollScannerStatusMachine,
  data: ({ client }) => ({ client }),
};

const listenForEvents: InvokeConfig<Context, Event> = {
  src:
    ({ client }) =>
    (callback) => {
      const listener = client.addListener((event) => {
        callback({ type: 'EVENT', event });
      });
      return () => client.removeListener(listener);
    },
};

function buildMachine({
  createScannerClient,
}: {
  createScannerClient: typeof createPdiScannerClient;
}) {
  const initialClient = createScannerClient();

  return createMachine<Context, Event>({
    id: 'precinct_scanner',
    initial: 'connecting',
    strict: true,
    context: { client: initialClient },
    states: {
      connecting: {
        invoke: {
          src: async ({ client }) => (await client.connect()).unsafeUnwrap(),
          onDone: 'checkingInitialStatus',
          onError: {
            target: 'disconnected',
            actions: assign({ error: (_, event) => event.data }),
          },
        },
      },

      checkingInitialStatus: {
        invoke: pollScannerStatus,
        on: {
          STATUS: [
            {
              cond: (_, event) => event.status.documentInScanner,
              target: 'rejecting',
            },
            { target: 'waitingForBallot' },
          ],
        },
      },

      waitingForBallot: {
        invoke: [
          {
            src: async ({ client }) =>
              (await client.enableScanning()).unsafeUnwrap(),
          },
          listenForEvents,
        ],
        on: {
          EVENT: [
            {
              cond: (_, { event }) => event.type === 'scanStart',
              target: 'scanning',
            },
            { target: 'error' },
          ],
        },
      },

      scanning: {
        invoke: listenForEvents,
        on: {
          EVENT: [
            {
              cond: (_, { event }) => event.type === 'scanComplete',
              target: 'interpreting',
            },
            { target: 'error' },
          ],
        },
      },

      interpreting: {
        after: {
          1000: 'accepting',
        },
      },

      accepting: {
        invoke: [
          {
            src: async ({ client }) => {
              (await client.ejectDocument('toRear')).unsafeUnwrap();
              // Prevent a second ballot from getting sucked all the way through
              // while the first is ejecting by disabling the feeder
              // immediately. This results in the second ballot getting
              // partially fed and then stopping, which we can then reject.
              // We can't disable the feeder before ejecting because then the
              // eject command doesn't work.
              (await client.disableScanning()).unsafeUnwrap();
            },
            onDone: 'checkingAcceptingComplete',
          },
        ],
      },

      checkingAcceptingComplete: {
        invoke: pollScannerStatus,
        on: {
          STATUS: [
            {
              cond: (_, event) => !event.status.documentInScanner,
              target: 'waitingForBallot',
            },
          ],
        },
      },

      rejecting: {
        invoke: [
          {
            src: async ({ client }) => {
              (await client.enableScanning()).unsafeUnwrap();
              (await client.ejectDocument('toFront')).unsafeUnwrap();
              (await client.disableScanning()).unsafeUnwrap();
            },
            onDone: 'checkingRejectingComplete',
          },
        ],
      },

      checkingRejectingComplete: {
        invoke: pollScannerStatus,
        on: {
          STATUS: [
            {
              cond: (_, event) => !event.status.documentInScanner,
              target: 'waitingForBallot',
            },
          ],
        },
      },

      disconnected: {},
      error: {},
    },
  });
}

let interrupted = false;
process.on('SIGINT', () => {
  interrupted = true;
});

export async function main(): Promise<void> {
  const machine = buildMachine({ createScannerClient: createPdiScannerClient });
  const machineService = interpretStateMachine(machine).start();
  machineService
    .onEvent((eventObject) => {
      const loggableEvent = (() => {
        const event = eventObject as Event;
        switch (event.type) {
          case 'STATUS':
            return event;
          case 'EVENT': {
            if (event.event.type === 'scanComplete') {
              return {
                type: 'EVENT',
                event: {
                  type: 'scanComplete',
                  images: event.event.images.map((image) => ({
                    width: image.width,
                    height: image.height,
                    data: image.data.length,
                  })),
                },
              };
            }
            return event;
          }
          default:
            return event;
        }
      })();
      console.log(`Event: ${JSON.stringify(loggableEvent)}`);
    })
    .onChange((context, previousContext) => {
      if (!previousContext) return;
      const changed = Object.entries(context)
        .filter(
          ([key, value]) => previousContext[key as keyof Context] !== value
        )
        // We only log fields that are key for understanding state machine
        // behavior, since others would be too verbose (e.g. scanner client
        // object)
        .filter(([key]) => ['error'].includes(key))
        .map(([key, value]) => [
          key,
          value === undefined ? 'undefined' : value,
        ]);
      if (changed.length === 0) return;
      console.log(
        `Context changed: ${JSON.stringify(Object.fromEntries(changed))}`
      );
    })
    .onTransition((state) => {
      if (!state.changed) return;
      console.log(`Transitioned to: ${JSON.stringify(state.value)}`);
    });

  while (!interrupted) {
    await sleep(1000);
  }
  (await machine.context.client.exit()).unsafeUnwrap();
}
