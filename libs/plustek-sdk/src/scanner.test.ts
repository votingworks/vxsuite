import { fakeChildProcess } from '@votingworks/test-utils';
import { sleep } from '@votingworks/basics';
import * as cp from 'child_process';
import { mocked } from 'ts-jest/utils';
import { DEFAULT_CONFIG } from './config';
import { ScannerError } from './errors';
import { PaperStatus } from './paper_status';
import {
  ClientDisconnectedError,
  createClient,
  InvalidClientResponseError,
} from './scanner';

const spawn = mocked(cp.spawn);
const nextTick = Promise.resolve();

function retryUntil({ times }: { times: number }): () => boolean {
  let remainingRetries = times;
  return () => {
    remainingRetries -= 1;
    return remainingRetries >= 0;
  };
}

jest.mock('child_process');

beforeEach(() => {
  jest.clearAllMocks();
});

test('no savepath given', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);
  const onConfigResolved = jest.fn();
  void (await createClient(
    { ...DEFAULT_CONFIG, savepath: undefined },
    {
      onConfigResolved,
      onConnecting() {
        // simulate a child process immediately exiting
        plustekctl.emit('exit', 0);
      },
    }
  ));
  expect(onConfigResolved.mock.calls[0][0].savepath).toContain('tmp');
});

test('savepath given', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);
  const onConfigResolved = jest.fn();
  void (await createClient(
    { ...DEFAULT_CONFIG, savepath: '/some/path' },
    {
      onConfigResolved,
      onConnecting() {
        // simulate a child process immediately exiting
        plustekctl.emit('exit', 0);
      },
    }
  ));
  expect(onConfigResolved.mock.calls[0][0].savepath).toEqual('/some/path');
});

test('cannot spawn plustekctl', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);
  const result = await createClient(undefined, {
    onConnecting() {
      // simulate `spawn` failure due to an out-of-memory error
      plustekctl.emit('error', new Error('spawn plustekctl ENOMEM'));
    },
    onConnected: jest.fn(() => {
      throw new Error('onConnected unexpectedly called!');
    }),
  });
  expect(result.unsafeUnwrapErr()).toEqual(
    new Error('connection error: Error: spawn plustekctl ENOMEM')
  );
});

test('plustekctl spawns but immediately exits', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);
  const result = await createClient(DEFAULT_CONFIG, {
    onConnecting() {
      // simulate a child process immediately exiting
      plustekctl.emit('exit', 0);
    },
    onConnected: jest.fn(() => {
      throw new Error('onConnected unexpectedly called!');
    }),
  });
  expect(result.unsafeUnwrapErr()).toEqual(
    new ClientDisconnectedError(
      `connection error: plustekctl exited unexpectedly (pid=${plustekctl.pid}, code=0, signal=undefined)`
    )
  );
});

test('plustekctl spawns but fails the handshake', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);
  const result = await createClient(DEFAULT_CONFIG, {
    async onWaitingForHandshake() {
      // simulate "cannot find scanners" after startup delay
      await sleep(1);
      plustekctl.emit('exit', 1);
    },
    onConnected: jest.fn(() => {
      throw new Error('onConnected unexpectedly called!');
    }),
  });
  expect(result.unsafeUnwrapErr()).toEqual(
    new ClientDisconnectedError(
      `connection error: plustekctl exited unexpectedly (pid=${plustekctl.pid}, code=1, signal=undefined)`
    )
  );
});

test('client connects and disconnects successfully', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const onConnected = jest.fn();
  const onDisconnected = jest.fn();
  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append(
          'plustek something something firmware\n<<<>>>\nready\n<<<>>>\n'
        );
      }),
      onConnected,
      onDisconnected,
    })
  ).unsafeUnwrap();

  expect(client.isConnected()).toEqual(true);
  expect(onConnected).toHaveBeenCalledTimes(1);

  // initiate quit
  const closeResultPromise = client.close();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('quit\n');
  plustekctl.stdout.append('<<<>>>\nquit: ok\n<<<>>>\n');
  (await closeResultPromise).unsafeUnwrap();

  // simulate plustekctl exiting
  plustekctl.emit('exit', 0);

  expect(client.isConnected()).toEqual(false);
  expect(onDisconnected).toHaveBeenCalledTimes(1);
});

test('unsuccessful disconnect returns error', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const onDisconnected = jest.fn();
  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
      onDisconnected,
    })
  ).unsafeUnwrap();

  // initiate quit
  const closeResultPromise = client.close();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('quit\n');
  plustekctl.stdout.append(
    `<<<>>>\nuh uh uh! you didn't say the magic word!\n<<<>>>\n`
  );
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  const error = (await closeResultPromise).unsafeUnwrapErr();
  expect(error).toEqual(
    new InvalidClientResponseError(
      `invalid response: uh uh uh! you didn't say the magic word!`
    )
  );
  expect(error).toBeInstanceOf(InvalidClientResponseError);
});

test('client cannot send commands after disconnect', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  // simulate plustekctl exiting
  plustekctl.emit('exit', 0);

  expect(client.isConnected()).toEqual(false);
  expect((await client.getPaperStatus()).unsafeUnwrapErr()).toBeInstanceOf(
    ClientDisconnectedError
  );
  expect((await client.scan()).unsafeUnwrapErr()).toBeInstanceOf(
    ClientDisconnectedError
  );
  expect((await client.close()).unsafeUnwrapErr()).toBeInstanceOf(
    ClientDisconnectedError
  );
  expect((await client.accept()).unsafeUnwrapErr()).toBeInstanceOf(
    ClientDisconnectedError
  );
  expect(
    (await client.reject({ hold: true })).unsafeUnwrapErr()
  ).toBeInstanceOf(ClientDisconnectedError);
});

test('client responds with wrong IPC command', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.getPaperStatus();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('get-paper-status\n');
  plustekctl.stdout.append(
    `<<<>>>\nunknown-response-thing: hey there!\n<<<>>>\n`
  );
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  const error = (await resultPromise).unsafeUnwrapErr();
  expect(error).toEqual(
    new InvalidClientResponseError(
      'invalid response: unknown-response-thing: hey there!'
    )
  );
  expect(error).toBeInstanceOf(InvalidClientResponseError);
});

test('getPaperStatus succeeds', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.getPaperStatus();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('get-paper-status\n');
  plustekctl.stdout.append(
    `<<<>>>\nget-paper-status: ${PaperStatus.VtmReadyToScan}\n<<<>>>\n`
  );
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect((await resultPromise).unsafeUnwrap()).toEqual(
    PaperStatus.VtmReadyToScan
  );
});

test('getPaperStatus returns error for invalid response', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.getPaperStatus();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('get-paper-status\n');
  plustekctl.stdout.append(
    '<<<>>>\nget-paper-status: not a real status\n<<<>>>\n'
  );
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect(((await resultPromise).unsafeUnwrapErr() as Error).message).toContain(
    'Invalid enum value'
  );
});

test('getPaperStatus returns known error', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.getPaperStatus();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('get-paper-status\n');
  plustekctl.stdout.append(
    `<<<>>>\nget-paper-status: err=${ScannerError.NoDevices}\n<<<>>>\n`
  );
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect((await resultPromise).unsafeUnwrapErr()).toEqual(
    ScannerError.NoDevices
  );
});

test('getPaperStatus returns unknown error', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.getPaperStatus();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('get-paper-status\n');
  plustekctl.stdout.append(`<<<>>>\nget-paper-status: err=WHAT??\n<<<>>>\n`);
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect(((await resultPromise).unsafeUnwrapErr() as Error).message).toEqual(
    'WHAT??'
  );
});

test('scan succeeds', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.scan();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('scan\n');
  plustekctl.stdout.append(`<<<>>>\nscan: file=file01.jpg\n<<<>>>\n`);
  plustekctl.stdout.append(`<<<>>>\nscan: file=file02.jpg\n<<<>>>\n`);
  plustekctl.stdout.append(`<<<>>>\nscan: ok\n<<<>>>\n`);
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect((await resultPromise).unsafeUnwrap()).toEqual({
    files: ['file01.jpg', 'file02.jpg'],
  });
});

test('scan returns error if less than two files produced', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.scan();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('scan\n');
  plustekctl.stdout.append(`<<<>>>\nscan: file=file01.jpg\n<<<>>>\n`);
  plustekctl.stdout.append(`<<<>>>\nscan: ok\n<<<>>>\n`);
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect(((await resultPromise).unsafeUnwrapErr() as Error).message).toEqual(
    "expected two files, got: [ 'file01.jpg' ]"
  );
});

test('scan responds with error', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.scan();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('scan\n');
  plustekctl.stdout.append(
    `<<<>>>\nscan: err=${ScannerError.InvalidParam}\n<<<>>>\n`
  );
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect((await resultPromise).unsafeUnwrapErr()).toEqual(
    ScannerError.InvalidParam
  );
});

test('scan returns error for invalid response', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.scan();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('scan\n');
  plustekctl.stdout.append(`<<<>>>\nbooga booga!\n<<<>>>\n`);
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect(((await resultPromise).unsafeUnwrapErr() as Error).message).toEqual(
    'invalid response: booga booga!'
  );
});

test('scan returns error for unknown data', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.scan();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('scan\n');
  plustekctl.stdout.append(`<<<>>>\nscan: url=localhost\n<<<>>>\n`);
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect(((await resultPromise).unsafeUnwrapErr() as Error).message).toEqual(
    'unexpected response data: url=localhost'
  );
});

test('scan succeeds after retries', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const retryCount = 5;
  const result = await client.scan({
    onScanAttemptStart: async (attempt) => {
      await nextTick;

      expect(plustekctl.stdin.toString()).toEqual('scan\n'.repeat(attempt + 1));
      if (attempt < retryCount) {
        // fail every attempt until…
        plustekctl.stdout.append(
          `<<<>>>\nscan: err=${ScannerError.SaneStatusIoError}\n<<<>>>\n`
        );
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      } else if (attempt === retryCount) {
        // …we succeed on the last attempt
        plustekctl.stdout.append(`<<<>>>\nscan: file=file01.jpg\n<<<>>>\n`);
        plustekctl.stdout.append(`<<<>>>\nscan: file=file02.jpg\n<<<>>>\n`);
        plustekctl.stdout.append(`<<<>>>\nscan: ok\n<<<>>>\n`);
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      } else {
        throw new Error(`unexpected attempt out of range: ${attempt}`);
      }
    },

    onScanAttemptEnd: (attempt, attemptResult) => {
      if (attempt < retryCount) {
        // assert failed
        attemptResult.unsafeUnwrapErr();
      } else {
        // assert success
        attemptResult.unsafeUnwrap();
      }
    },

    shouldRetry: retryUntil({ times: retryCount }),
  });

  expect(result.unsafeUnwrap()).toEqual({
    files: ['file01.jpg', 'file02.jpg'],
  });
});

test('plustekctl exits during scan', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const result = await client.scan({
    onScanAttemptStart: async () => {
      await nextTick;
      plustekctl.emit('exit', 1, null);
    },
  });

  expect(result.unsafeUnwrapErr()).toBeInstanceOf(ClientDisconnectedError);
});

test('calibrate succeeds', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.calibrate();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('calibrate\n');
  plustekctl.stdout.append(`<<<>>>\ncalibrate: ok\n<<<>>>\n`);
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
  (await resultPromise).unsafeUnwrap();
});

test('calibrate responds with error', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.calibrate();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('calibrate\n');
  plustekctl.stdout.append(
    `<<<>>>\ncalibrate: err=${ScannerError.InvalidParam}\n<<<>>>\n`
  );
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect((await resultPromise).unsafeUnwrapErr()).toEqual(
    ScannerError.InvalidParam
  );
});

test('calibrate returns error for invalid response', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.calibrate();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('calibrate\n');
  plustekctl.stdout.append(`<<<>>>\nbooga booga!\n<<<>>>\n`);
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect(((await resultPromise).unsafeUnwrapErr() as Error).message).toEqual(
    'invalid response: booga booga!'
  );
});

test('calibrate returns error for unknown data', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.calibrate();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('calibrate\n');
  plustekctl.stdout.append(`<<<>>>\ncalibrate: key=value\n<<<>>>\n`);
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect(((await resultPromise).unsafeUnwrapErr() as Error).message).toEqual(
    'invalid response: calibrate: key=value'
  );
});

test('accept succeeds', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.accept();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('accept\n');
  plustekctl.stdout.append(`<<<>>>\naccept: ok\n<<<>>>\n`);
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
  (await resultPromise).unsafeUnwrap();
});

test('accept returns known error', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.accept();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('accept\n');
  plustekctl.stdout.append(
    `<<<>>>\naccept: err=${ScannerError.NoSupportEject}\n<<<>>>\n`
  );
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect((await resultPromise).unsafeUnwrapErr()).toEqual(
    ScannerError.NoSupportEject
  );
});

test('accept returns error for invalid response', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.accept();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('accept\n');
  plustekctl.stdout.append(`<<<>>>\naccept: NOPE\n<<<>>>\n`);
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect(((await resultPromise).unsafeUnwrapErr() as Error).message).toEqual(
    'invalid response: accept: NOPE'
  );
});

test('reject succeeds', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.reject({ hold: false });
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('reject\n');
  plustekctl.stdout.append(`<<<>>>\nreject: ok\n<<<>>>\n`);
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
  (await resultPromise).unsafeUnwrap();
});

test('reject returns known error', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.reject({ hold: false });
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('reject\n');
  plustekctl.stdout.append(
    `<<<>>>\nreject: err=${ScannerError.NoSupportEject}\n<<<>>>\n`
  );
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect((await resultPromise).unsafeUnwrapErr()).toEqual(
    ScannerError.NoSupportEject
  );
});

test('reject returns error for invalid response', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.reject({ hold: false });
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('reject\n');
  plustekctl.stdout.append(`<<<>>>\nreject: NOPE\n<<<>>>\n`);
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect(((await resultPromise).unsafeUnwrapErr() as Error).message).toEqual(
    'invalid response: reject: NOPE'
  );
});

test('reject-hold succeeds', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const resultPromise = client.reject({ hold: true });
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('reject-hold\n');
  plustekctl.stdout.append(`<<<>>>\nreject-hold: ok\n<<<>>>\n`);
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
  (await resultPromise).unsafeUnwrap();
});

test('scan followed by reject succeeds', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  const scanResultPromise = client.scan();
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('scan\n');
  plustekctl.stdout.append(`<<<>>>\nscan: file=file01.jpg\n<<<>>>\n`);
  plustekctl.stdout.append(`<<<>>>\nscan: file=file02.jpg\n<<<>>>\n`);
  plustekctl.stdout.append(`<<<>>>\nscan: ok\n<<<>>>\n`);
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');

  expect((await scanResultPromise).unsafeUnwrap()).toEqual({
    files: ['file01.jpg', 'file02.jpg'],
  });

  const rejectResultPromise = client.reject({ hold: false });
  await nextTick;
  expect(plustekctl.stdin.toString()).toEqual('scan\nreject\n');
  plustekctl.stdout.append('<<<>>>\nreject: ok\n<<<>>>\n');
  plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
  (await rejectResultPromise).unsafeUnwrap();
});

test('overlapping calls', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  // enqueue IPCs #1 & #2
  const scanResultPromise = client.scan();
  const getPaperStatusResultPromise = client.getPaperStatus();
  await nextTick;

  // IPC #1 is going
  expect(plustekctl.stdin.toString()).toEqual('scan\n');
  plustekctl.stdout.append(`<<<>>>\nscan: file=file01.jpg\n<<<>>>\n`);
  plustekctl.stdout.append(`<<<>>>\nscan: file=file02.jpg\n<<<>>>\n`);
  plustekctl.stdout.append(`<<<>>>\nscan: ok\n<<<>>>\n`);

  expect((await scanResultPromise).unsafeUnwrap()).toEqual({
    files: ['file01.jpg', 'file02.jpg'],
  });

  // enqueue IPC #3
  const acceptResultPromise = client.accept();
  await nextTick;

  // now IPC #2 runs
  expect(plustekctl.stdin.toString()).toEqual('scan\nget-paper-status\n');

  plustekctl.stdout.append(
    `<<<>>>\nget-paper-status: ${PaperStatus.VtmReadyToEject}\n<<<>>>\n`
  );

  expect((await getPaperStatusResultPromise).unsafeUnwrap()).toEqual(
    PaperStatus.VtmReadyToEject
  );

  // now IPC #3 runs
  expect(plustekctl.stdin.toString()).toEqual(
    'scan\nget-paper-status\naccept\n'
  );

  plustekctl.stdout.append(`<<<>>>\naccept: ok\n<<<>>>\n`);
  (await acceptResultPromise).unsafeUnwrap();
});

test('kill', async () => {
  const plustekctl = fakeChildProcess();
  spawn.mockReturnValueOnce(plustekctl);

  const client = (
    await createClient(DEFAULT_CONFIG, {
      onWaitingForHandshake: jest.fn(() => {
        // simulate plustekctl indicating it is ready
        plustekctl.stdout.append('<<<>>>\nready\n<<<>>>\n');
      }),
    })
  ).unsafeUnwrap();

  // kill unsuccessfully
  (plustekctl.kill as jest.Mock).mockReturnValue(false);
  expect(client.kill().isErr()).toEqual(true);
  expect(plustekctl.kill).toHaveBeenCalledWith();

  // kill successfully
  (plustekctl.kill as jest.Mock).mockReturnValue(true);
  expect(client.kill().isOk()).toEqual(true);
  expect(plustekctl.kill).toHaveBeenCalledWith();
});
