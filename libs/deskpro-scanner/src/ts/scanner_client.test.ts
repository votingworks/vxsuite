import { afterEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { sleep } from '@votingworks/basics';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockDaemon, type MockScannerDaemon } from './mock_scanner.js';
import {
  DAEMON_KILL_GRACE_MS,
  DEFAULT_DAEMON_PATH,
  ScannerClient,
  spawnDaemon,
} from './scanner_client.js';
import {
  ErrorCode,
  FrameType,
  type ImageHeader,
  type Status,
  Writer,
  encodeFrame,
  FRAME_HEADER_LENGTH,
  MAX_FRAME_PAYLOAD,
} from './protocol.js';

let client: ScannerClient | undefined;

afterEach(() => {
  client?.stop();
  client = undefined;
});

/** A started client wired to an in-process daemon that has already said hello. */
async function withMock(): Promise<[ScannerClient, MockScannerDaemon]> {
  const daemon = createMockDaemon();
  const started = new ScannerClient(daemon.transport);
  client = started;
  const hello = started.start();
  daemon.sendHello();
  expect((await hello).unsafeUnwrap().daemonVersion).toEqual('0.0.0-mock');
  return [started, daemon];
}

const A_STATUS: Status = {
  state: 2,
  operationalState: 1,
  imagesAvailable: 4,
  feederLoaded: 1,
  nextFeederLoaded: 0,
  feederSide: 0,
};

const AN_IMAGE_HEADER: ImageHeader = {
  seqId: 42,
  streamId: 0,
  scanSide: 1,
  resolution: 200,
  pixelsPerLine: 4,
  lines: 2,
  bytesPerLine: 4,
  bitsPerPixel: 8,
  fileFormat: 2,
  compression: 0,
  doubleFeed: 0,
  blankPage: 0,
  integrity: 0,
  counters: [1, 2, 3, 4],
  endorserFrontText: 'batch7_0042',
  endorserBackText: '',
};

// ----------------------------------------------------------------------------
// Against the in-process mock
// ----------------------------------------------------------------------------

test('starting twice is refused', async () => {
  const [scanner] = await withMock();
  expect((await scanner.start()).unsafeUnwrapErr()).toEqual({
    code: 'other',
    message: 'already started',
  });
});

test.each([
  ['connect', (c: ScannerClient) => c.connect('vitest'), 1],
  ['disconnect', (c: ScannerClient) => c.disconnect(), 2],
  ['exit', (c: ScannerClient) => c.exit(), 0],
  ['setProfile', (c: ScannerClient) => c.setProfile('a = 1\n'), 6],
  ['setReady', (c: ScannerClient) => c.setReady(true), 7],
  ['scanStart', (c: ScannerClient) => c.scanStart(), 8],
  ['scanStop', (c: ScannerClient) => c.scanStop(), 9],
  ['scanPause', (c: ScannerClient) => c.scanPause(), 10],
  ['scanResume', (c: ScannerClient) => c.scanResume(), 11],
  ['setImprinterText', (c: ScannerClient) => c.setImprinterText('x'), 12],
  ['setCounter', (c: ScannerClient) => c.setCounter(1, 5), 13],
  ['setNumberOfSheets', (c: ScannerClient) => c.setNumberOfSheets(25), 14],
] as const)(
  '%s sends its own command and accepts ok',
  async (_, call, kind) => {
    const [scanner, daemon] = await withMock();
    const pending = call(scanner);
    await vi.waitFor(() => expect(daemon.received).toHaveLength(1));
    expect(daemon.received[0]?.kind).toEqual(kind);
    daemon.respondOk();
    expect((await pending).unsafeUnwrap()).toBeUndefined();
  }
);

test('getStatus decodes the status response', async () => {
  const [scanner, daemon] = await withMock();
  const pending = scanner.getStatus();
  await vi.waitFor(() => expect(daemon.received).toHaveLength(1));
  daemon.respondStatus(A_STATUS);
  expect((await pending).unsafeUnwrap()).toEqual(A_STATUS);
});

test('getVersions decodes the versions response', async () => {
  const [scanner, daemon] = await withMock();
  const pending = scanner.getVersions();
  await vi.waitFor(() => expect(daemon.received).toHaveLength(1));
  daemon.respondVersions('3.0.0.0', 'DeskPro 631');
  expect((await pending).unsafeUnwrap()).toEqual({
    api: '3.0.0.0',
    scanner: 'DeskPro 631',
  });
});

test('getProfile decodes the profile response', async () => {
  const [scanner, daemon] = await withMock();
  const pending = scanner.getProfile();
  await vi.waitFor(() => expect(daemon.received).toHaveLength(1));
  daemon.respondProfile('ProfilePaper_brightness = 200\n');
  expect((await pending).unsafeUnwrap()).toEqual(
    'ProfilePaper_brightness = 200\n'
  );
});

test.each(Object.entries(ErrorCode))(
  'error code %s (%d) is reported as is',
  async (clientCode, wireCode) => {
    const [scanner, daemon] = await withMock();
    const pending = scanner.scanStart();
    await vi.waitFor(() => expect(daemon.received).toHaveLength(1));
    daemon.respondError(wireCode, 'nope');
    expect((await pending).unsafeUnwrapErr()).toEqual({
      code: clientCode,
      message: 'nope',
    });
  }
);

test('a response of the wrong shape is reported as a protocol error', async () => {
  const [scanner, daemon] = await withMock();
  const pending = scanner.getStatus();
  await vi.waitFor(() => expect(daemon.received).toHaveLength(1));
  daemon.respondProfile('not a status');
  expect((await pending).unsafeUnwrapErr()).toEqual({
    code: 'protocol',
    message: 'expected a status response, got profile',
  });
});

test('events reach listeners', async () => {
  const [scanner, daemon] = await withMock();
  const events: unknown[] = [];
  scanner.on('event', (event) => events.push(event));

  daemon.sendEvent({ kind: 'log', message: 'state scanning' });
  daemon.sendEvent({
    kind: 'control',
    controlType: 30,
    numData: 1,
    strData: 'Feeder empty',
  });
  daemon.sendEvent({ kind: 'disconnected', message: 'gone' });
  daemon.sendEvent({ kind: 'incompatibleImage', size: 30_000 });
  daemon.sendEvent({ kind: 'operationalState', state: 0 });
  const oversized = {
    kind: 'oversizedImage',
    seqId: 42,
    scanSide: 1,
    size: 70_000_000,
  } as const;
  daemon.sendEvent(oversized);

  await vi.waitFor(() => expect(events).toHaveLength(6));
  expect(events[0]).toEqual({ kind: 'log', message: 'state scanning' });
  expect(events[3]).toEqual({ kind: 'incompatibleImage', size: 30_000 });
  expect(events[4]).toEqual({ kind: 'operationalState', state: 0 });
  expect(events[5]).toEqual(oversized);
});

test('an image arrives with its pixels intact', async () => {
  const [scanner, daemon] = await withMock();
  const images: Array<{ header: ImageHeader; data: Buffer }> = [];
  scanner.on('image', (image) => images.push(image));

  const pixels = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
  daemon.sendImage(AN_IMAGE_HEADER, pixels);

  await vi.waitFor(() => expect(images).toHaveLength(1));
  expect(images[0]?.header).toEqual(AN_IMAGE_HEADER);
  expect(images[0]?.data).toEqual(pixels);
});

test('a frame split across chunks is reassembled', async () => {
  const [scanner, daemon] = await withMock();
  const events: unknown[] = [];
  scanner.on('event', (event) => events.push(event));

  const frame = encodeFrame(
    FrameType.Event,
    new Writer().u8(0).str('split').finish()
  );
  for (const byte of frame) {
    daemon.sendRaw(Buffer.of(byte));
  }

  await vi.waitFor(() => expect(events).toHaveLength(1));
  expect(events[0]).toEqual({ kind: 'log', message: 'split' });
});

test('two frames in one chunk are both delivered', async () => {
  const [scanner, daemon] = await withMock();
  const events: unknown[] = [];
  scanner.on('event', (event) => events.push(event));

  const one = encodeFrame(
    FrameType.Event,
    new Writer().u8(0).str('one').finish()
  );
  const two = encodeFrame(
    FrameType.Event,
    new Writer().u8(0).str('two').finish()
  );
  daemon.sendRaw(Buffer.concat([one, two]));

  await vi.waitFor(() => expect(events).toHaveLength(2));
});

test('an oversized frame header tears the connection down', async () => {
  const [scanner, daemon] = await withMock();
  const header = Buffer.alloc(FRAME_HEADER_LENGTH);
  header.writeUInt32LE(MAX_FRAME_PAYLOAD + 1, 1);
  daemon.sendRaw(Buffer.concat([header, Buffer.alloc(16)]));
  await vi.waitFor(async () =>
    expect((await scanner.getStatus()).unsafeUnwrapErr()).toEqual({
      code: 'protocol',
      message: expect.stringMatching(/exceeds/),
    })
  );
});

test('a protocol error stops the daemon and emits close', async () => {
  const [scanner, daemon] = await withMock();
  const closed: string[] = [];
  scanner.on('close', (reason) => closed.push(reason));
  daemon.sendRaw(encodeFrame(99, Buffer.alloc(0)));
  await vi.waitFor(() => expect(closed).toEqual(['mock daemon stopped']));
  expect((await scanner.getStatus()).unsafeUnwrapErr().code).toEqual(
    'protocol'
  );
});

test('frames that arrive after the daemon goes away are ignored', async () => {
  const [scanner, daemon] = await withMock();
  const events: unknown[] = [];
  scanner.on('event', (event) => events.push(event));
  daemon.close('it crashed');
  daemon.sendRaw(
    encodeFrame(FrameType.Event, new Writer().u8(0).str('late').finish())
  );
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  expect(events).toEqual([]);
});

test('an exception from a listener propagates without tearing the connection down', async () => {
  const [scanner, daemon] = await withMock();
  scanner.on('event', () => {
    throw new Error('listener bug');
  });
  const frame = encodeFrame(
    FrameType.Event,
    new Writer().u8(0).str('one').finish()
  );
  expect(() => daemon.transport.incoming.emit('data', frame)).toThrow(
    'listener bug'
  );

  const status = scanner.getStatus();
  await vi.waitFor(() => expect(daemon.received).toHaveLength(1));
  daemon.respondStatus(A_STATUS);
  expect((await status).unsafeUnwrap()).toEqual(A_STATUS);
});

test('a command in flight during a protocol error fails with the protocol code', async () => {
  const [scanner, daemon] = await withMock();
  const pending = scanner.getStatus();
  await vi.waitFor(() => expect(daemon.received).toHaveLength(1));
  daemon.sendRaw(encodeFrame(99, Buffer.alloc(0)));
  expect((await pending).unsafeUnwrapErr()).toEqual({
    code: 'protocol',
    message: 'unknown frame type 99',
  });
});

test('an unknown frame type tears the connection down', async () => {
  const [scanner, daemon] = await withMock();
  daemon.sendRaw(encodeFrame(99, Buffer.alloc(0)));
  await vi.waitFor(async () =>
    expect((await scanner.scanStart()).unsafeUnwrapErr()).toEqual({
      code: 'protocol',
      message: 'unknown frame type 99',
    })
  );
});

test('a response to a command we never sent tears the connection down', async () => {
  const [scanner, daemon] = await withMock();
  daemon.respondToUnknownCommand();
  await vi.waitFor(async () =>
    expect((await scanner.scanStart()).unsafeUnwrapErr().message).toMatch(
      /unknown command id 65535/
    )
  );
});

test('pending commands are rejected when the daemon goes away', async () => {
  const [scanner, daemon] = await withMock();
  const closed: string[] = [];
  scanner.on('close', (reason) => closed.push(reason));

  const pending = scanner.getStatus();
  await vi.waitFor(() => expect(daemon.received).toHaveLength(1));
  daemon.close('it crashed');

  expect((await pending).unsafeUnwrapErr()).toEqual({
    code: 'daemonExited',
    message: 'it crashed',
  });
  expect(closed).toEqual(['it crashed']);
  // Later commands fail immediately rather than hanging forever.
  expect((await scanner.scanStart()).unsafeUnwrapErr().code).toEqual(
    'daemonExited'
  );
  // A second close is ignored.
  daemon.close('again');
  expect(closed).toEqual(['it crashed']);
});

test.each([
  ['a negative sheet count', (c: ScannerClient) => c.setNumberOfSheets(-1)],
  ['a counter index over 255', (c: ScannerClient) => c.setCounter(256, 0)],
  ['an unsafe counter value', (c: ScannerClient) => c.setCounter(0, 2 ** 60)],
])('%s is refused without reaching the daemon', async (_, command) => {
  const [scanner, daemon] = await withMock();
  expect((await command(scanner)).unsafeUnwrapErr().code).toEqual('badRequest');

  const status = scanner.getStatus();
  await vi.waitFor(() => expect(daemon.received).toHaveLength(1));
  daemon.respondStatus(A_STATUS);
  expect((await status).unsafeUnwrap()).toEqual(A_STATUS);
});

test('concurrent commands are matched to their own responses', async () => {
  const [scanner, daemon] = await withMock();
  const status = scanner.getStatus();
  const profile = scanner.getProfile();
  await vi.waitFor(() => expect(daemon.received).toHaveLength(2));

  daemon.respondStatus(A_STATUS);
  daemon.respondProfile('p');
  expect((await status).unsafeUnwrap()).toEqual(A_STATUS);
  expect((await profile).unsafeUnwrap()).toEqual('p');
});

// ----------------------------------------------------------------------------
// Against the real daemon binary
// ----------------------------------------------------------------------------

/**
 * These run the actual `deskproctl`, so they check the Rust encoder against the TypeScript
 * decoder and back — the thing a hand-written binary protocol most needs covered. No scanner and
 * no vendor driver are needed: the daemon `dlopen`s `libinoapi.so` lazily, on `connect`.
 */
test('the real daemon announces its version', async () => {
  // Exercises both defaults: `spawnDaemon()` finds the built binary and `new ScannerClient()`
  // spawns it.
  client = new ScannerClient();
  const hello = (await client.start()).unsafeUnwrap();
  expect(hello.daemonVersion).toMatch(/^\d+\.\d+\.\d+$/);
});

test('the real daemon reports notConnected for every command needing a driver', async () => {
  client = new ScannerClient(spawnDaemon(DEFAULT_DAEMON_PATH));
  (await client.start()).unsafeUnwrap();

  for (const result of await Promise.all([
    client.getStatus(),
    client.getProfile(),
    client.getVersions(),
    client.scanStart(),
    client.scanStop(),
    client.scanPause(),
    client.scanResume(),
    client.setReady(true),
    client.setProfile('a = 1\n'),
    client.setImprinterText('batch7_%CNT1%'),
    client.setCounter(1, 0),
    client.setNumberOfSheets(25),
  ])) {
    expect(result.unsafeUnwrapErr().code).toEqual('notConnected');
  }
});

test('the real daemon reports driverUnavailable with the loader diagnosis', async () => {
  const missing = '/nonexistent/libinoapi.so';
  process.env['DESKPRO_INOAPI_PATH'] = missing;
  client = new ScannerClient(spawnDaemon(DEFAULT_DAEMON_PATH));
  (await client.start()).unsafeUnwrap();
  const result = await client.connect('vitest');
  delete process.env['DESKPRO_INOAPI_PATH'];

  const error = result.unsafeUnwrapErr();
  expect(error.code).toEqual('driverUnavailable');
  // The loader's own message has to survive, or an operator sees only "dlopen failed".
  expect(error.message).toContain(missing);
  expect(error.message).toMatch(/No such file|cannot open/i);
});

test('the real daemon exits cleanly on request', async () => {
  client = new ScannerClient(spawnDaemon(DEFAULT_DAEMON_PATH));
  (await client.start()).unsafeUnwrap();
  const closed = new Promise((resolve) => {
    client?.once('close', resolve);
  });

  expect((await client.exit()).unsafeUnwrap()).toBeUndefined();
  await closed;
  expect((await client.getStatus()).unsafeUnwrapErr().code).toEqual(
    'daemonExited'
  );
});

test('spawning a daemon that is not there fails instead of hanging', async () => {
  client = new ScannerClient(spawnDaemon('/nonexistent/deskproctl'));
  expect((await client.start()).unsafeUnwrapErr().code).toEqual('daemonExited');
});

test('a daemon that fails to spawn before `start` is reported, not thrown', async () => {
  client = new ScannerClient(spawnDaemon('/nonexistent/deskproctl'));
  await sleep(100);
  expect((await client.start()).unsafeUnwrapErr()).toEqual({
    code: 'daemonExited',
    message: expect.stringContaining('ENOENT'),
  });
});

/** Runs `fn` with the path of an executable shell script standing in for `deskproctl`. */
async function withStubDaemon(
  script: string,
  fn: (daemonPath: string) => Promise<void>
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'deskproctl-'));
  const daemonPath = join(directory, 'deskproctl');
  writeFileSync(daemonPath, `#!/bin/sh\n${script}\n`);
  chmodSync(daemonPath, 0o755);
  try {
    await fn(daemonPath);
  } finally {
    rmSync(directory, { recursive: true });
  }
}

test('a daemon that stops reading stdin is stopped instead of crashing the host', async () => {
  await withStubDaemon('exec 0<&-\nsleep 10', async (daemonPath) => {
    client = new ScannerClient(spawnDaemon(daemonPath));
    const hello = client.start();
    await sleep(100);
    expect((await client.getStatus()).unsafeUnwrapErr()).toEqual({
      code: 'daemonExited',
      message: 'deskproctl exited with code null, signal SIGTERM',
    });
    expect((await hello).unsafeUnwrapErr().code).toEqual('daemonExited');
  });
});

test('a daemon that exits before `start` is reported instead of hanging', async () => {
  await withStubDaemon('exit 1', async (daemonPath) => {
    client = new ScannerClient(spawnDaemon(daemonPath));
    await sleep(100);
    expect((await client.start()).unsafeUnwrapErr()).toEqual({
      code: 'daemonExited',
      message: 'deskproctl exited with code 1, signal null',
    });
  });
});

test('a daemon that ignores SIGTERM is killed after the grace period', async () => {
  await withStubDaemon("trap '' TERM\nexec sleep 30", async (daemonPath) => {
    const transport = spawnDaemon(daemonPath);
    const exited = new Promise<string>((resolve) => {
      transport.onClose(resolve);
    });
    await sleep(100);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      transport.close();
      vi.advanceTimersByTime(DAEMON_KILL_GRACE_MS);
    } finally {
      vi.useRealTimers();
    }
    expect(await exited).toEqual(
      'deskproctl exited with code null, signal SIGKILL'
    );
    transport.close();
  });
});

test('the mock reassembles a command split across writes', async () => {
  const [, daemon] = await withMock();
  const frame = encodeFrame(
    FrameType.Command,
    new Writer().u32(1).u8(1).str('vitest').finish()
  );
  // Split before the header is complete, then again mid-payload.
  daemon.transport.outgoing.write(frame.subarray(0, 3));
  await vi.waitFor(() => expect(daemon.received).toHaveLength(0));
  daemon.transport.outgoing.write(frame.subarray(3, 8));
  await vi.waitFor(() => expect(daemon.received).toHaveLength(0));
  daemon.transport.outgoing.write(frame.subarray(8));
  await vi.waitFor(() => expect(daemon.received).toHaveLength(1));
});

test('the mock refuses to respond when nothing is outstanding', async () => {
  const [, daemon] = await withMock();
  expect(() => daemon.respondOk()).toThrow(/no unanswered command/);
});

test('the mock closes with a default reason', async () => {
  const [scanner, daemon] = await withMock();
  const closed: string[] = [];
  scanner.on('close', (reason) => closed.push(reason));
  daemon.close();
  expect(closed).toEqual(['mock daemon closed']);
});
