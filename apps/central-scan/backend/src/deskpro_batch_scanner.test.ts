import { readFileSync } from 'node:fs';
import { expect, onTestFinished, test, vi } from 'vitest';
import { type Device, isDeviceAttached } from '@votingworks/backend';
import { err } from '@votingworks/basics';
import {
  type Command,
  createMockDaemon,
  type ErrorCodeName,
  type MockScannerDaemon,
  ScannerClient,
  VX_PROFILE_PATH,
} from '@votingworks/deskpro-scanner';
import {
  DESKPRO_APP_ID,
  DeskProBatchScanner,
  type DeskProBatchScannerOptions,
  INOTEC_DESKPRO_PRODUCT_ID,
  INOTEC_VENDOR_ID,
} from './deskpro_batch_scanner.js';

vi.mock(import('@votingworks/backend'), async (importActual) => ({
  ...(await importActual()),
  isDeviceAttached: vi.fn(),
}));

const isDeviceAttachedMock = vi.mocked(isDeviceAttached);

const NOT_SUPPORTED = err({
  code: 'scan_failed',
  message: 'Scanning with the DeskPro is not yet supported',
});

const WAIT_OPTIONS = { interval: 1 } as const;
const PROFILE = readFileSync(VX_PROFILE_PATH, 'utf8');

function usbDevice(idVendor: number, idProduct: number): Device {
  return { deviceDescriptor: { idVendor, idProduct } } as unknown as Device;
}

/** A spawned mock daemon that tracks which of its commands the test has checked. */
class ScriptedDaemon {
  private readonly mock: MockScannerDaemon;
  private checked = 0;

  constructor(mock: MockScannerDaemon) {
    this.mock = mock;
  }

  async expectCommand(command: Command): Promise<void> {
    await vi.waitFor(() => {
      expect(this.mock.received.length).toBeGreaterThan(this.checked);
    }, WAIT_OPTIONS);
    expect(this.mock.received[this.checked]!.body).toEqual(command);
    this.checked += 1;
  }

  expectNoMoreCommands(): void {
    expect(this.mock.received).toHaveLength(this.checked);
  }

  respondOk(): void {
    this.mock.respondOk();
  }

  respondError(code: ErrorCodeName, message: string): void {
    this.mock.respondError(code, message);
  }

  /** Simulates the daemon process ending. */
  close(reason: string): void {
    this.mock.close(reason);
  }

  async expectConnect(): Promise<void> {
    this.mock.sendHello();
    await this.expectCommand({ kind: 'connect', appId: DESKPRO_APP_ID });
  }

  async expectOpenSession(): Promise<void> {
    await this.expectConnect();
    this.respondOk();
    await this.expectCommand({ kind: 'setProfile', profile: PROFILE });
    this.respondOk();
    await this.expectCommand({ kind: 'setReady', ready: true });
    this.respondOk();
  }

  /** Answers `exit` the way `deskproctl` does: `ok`, then the process ends. */
  async expectExit(): Promise<void> {
    await this.expectCommand({ kind: 'exit' });
    this.respondOk();
    this.close('deskproctl exited with code 0, signal null');
  }
}

interface MockDaemons {
  readonly createClient: () => ScannerClient;
  count(): number;
  /** Waits for the next daemon the scanner spawns. */
  next(): Promise<ScriptedDaemon>;
}

/** Hands each client the scanner creates its own {@link ScriptedDaemon}, in spawn order. */
function createMockDaemons(): MockDaemons {
  const spawned: ScriptedDaemon[] = [];
  let claimed = 0;

  return {
    createClient() {
      const mock = createMockDaemon();
      spawned.push(new ScriptedDaemon(mock));
      return new ScannerClient(mock.transport);
    },

    count() {
      return spawned.length;
    },

    async next() {
      await vi.waitFor(() => {
        expect(spawned.length).toBeGreaterThan(claimed);
      }, WAIT_OPTIONS);
      const daemon = spawned[claimed]!;
      claimed += 1;
      return daemon;
    },
  };
}

function setUpScanner(options: Partial<DeskProBatchScannerOptions> = {}): {
  scanner: DeskProBatchScanner;
  daemons: MockDaemons;
} {
  const daemons = createMockDaemons();
  const scanner = new DeskProBatchScanner({
    createClient: daemons.createClient,
    connectRetryDelayMs: 0,
    ...options,
  });
  return { scanner, daemons };
}

test('attached based on detected USB devices', () => {
  const { scanner } = setUpScanner();

  isDeviceAttachedMock.mockReturnValue(true);
  expect(scanner.isAttached()).toEqual(true);

  isDeviceAttachedMock.mockReturnValue(false);
  expect(scanner.isAttached()).toEqual(false);

  const isDeskPro = isDeviceAttachedMock.mock.calls[0]![0];
  expect(
    isDeskPro(usbDevice(INOTEC_VENDOR_ID, INOTEC_DESKPRO_PRODUCT_ID))
  ).toEqual(true);
  expect(isDeskPro(usbDevice(INOTEC_VENDOR_ID, 0x0002))).toEqual(false);
  expect(isDeskPro(usbDevice(0x04c5, INOTEC_DESKPRO_PRODUCT_ID))).toEqual(
    false
  );
});

test('imprinter is not detected', async () => {
  await expect(setUpScanner().scanner.isImprinterDetected()).resolves.toEqual(
    false
  );
});

test('opens a session for the batch and ends it with the batch', async () => {
  const { scanner, daemons } = setUpScanner();
  const batch = scanner.startBatch();

  const firstSheet = batch.scanSheet();
  const daemon = await daemons.next();
  await daemon.expectOpenSession();
  expect(await firstSheet).toEqual(NOT_SUPPORTED);

  expect(await batch.scanSheet()).toEqual(NOT_SUPPORTED);
  expect(daemons.count()).toEqual(1);
  daemon.expectNoMoreCommands();

  const ended = batch.endBatch();
  await daemon.expectExit();
  await ended;
});

test('each batch gets its own session', async () => {
  const { scanner, daemons } = setUpScanner();

  for (let i = 0; i < 2; i += 1) {
    const batch = scanner.startBatch();
    const sheet = batch.scanSheet();
    const daemon = await daemons.next();
    await daemon.expectOpenSession();
    expect(await sheet).toEqual(NOT_SUPPORTED);
    const ended = batch.endBatch();
    await daemon.expectExit();
    await ended;
  }

  expect(daemons.count()).toEqual(2);
});

test('ending a batch that never scanned starts no session', async () => {
  const createClient = vi.fn<() => ScannerClient>();
  const scanner = new DeskProBatchScanner({ createClient });
  await scanner.startBatch().endBatch();
  expect(createClient).not.toHaveBeenCalled();
});

test('retries with a fresh daemon while the scanner reports a lingering connection', async () => {
  const { scanner, daemons } = setUpScanner();
  const batch = scanner.startBatch();
  const sheet = batch.scanSheet();

  const refused = await daemons.next();
  await refused.expectConnect();
  refused.respondError(
    'scannerInUse',
    'ScannerConnect failed: Scanner already connected'
  );
  await refused.expectExit();

  const daemon = await daemons.next();
  await daemon.expectOpenSession();
  expect(await sheet).toEqual(NOT_SUPPORTED);

  const ended = batch.endBatch();
  await daemon.expectExit();
  await ended;
});

test('gives up once the connect attempts run out', async () => {
  const { scanner, daemons } = setUpScanner({ connectAttempts: 2 });
  const batch = scanner.startBatch();
  const sheet = batch.scanSheet();

  for (let i = 0; i < 2; i += 1) {
    const daemon = await daemons.next();
    await daemon.expectConnect();
    daemon.respondError(
      'scannerInUse',
      'ScannerConnect failed: Scanner already connected'
    );
    await daemon.expectExit();
  }

  expect(await sheet).toEqual(
    err({
      code: 'scan_failed',
      message:
        'DeskPro connect failed: ScannerConnect failed: Scanner already connected',
    })
  );
  await batch.endBatch();
  expect(daemons.count()).toEqual(2);
});

test.each<[ErrorCodeName, string]>([
  ['driverUnavailable', 'libinoapi.so not found'],
  ['alreadyConnected', 'a Driver is already connected in this process'],
])('does not retry a %s connect error', async (code, message) => {
  const { scanner, daemons } = setUpScanner();
  const sheet = scanner.startBatch().scanSheet();

  const daemon = await daemons.next();
  await daemon.expectConnect();
  daemon.respondError(code, message);
  await daemon.expectExit();

  expect(await sheet).toEqual(
    err({ code: 'scan_failed', message: `DeskPro connect failed: ${message}` })
  );
  expect(daemons.count()).toEqual(1);
});

test('kills a daemon that dies before saying hello', async () => {
  const { scanner, daemons } = setUpScanner();
  const sheet = scanner.startBatch().scanSheet();

  const daemon = await daemons.next();
  daemon.close('deskproctl exited with code 1, signal null');

  expect(await sheet).toEqual(
    err({
      code: 'scan_failed',
      message:
        'DeskPro connect failed: deskproctl exited with code 1, signal null',
    })
  );
  daemon.expectNoMoreCommands();
});

test('ends the session when the profile is rejected', async () => {
  const { scanner, daemons } = setUpScanner();
  const sheet = scanner.startBatch().scanSheet();

  const daemon = await daemons.next();
  await daemon.expectConnect();
  daemon.respondOk();
  await daemon.expectCommand({ kind: 'setProfile', profile: PROFILE });
  daemon.respondError('driver', 'SetScannerSetup failed (504)');
  await daemon.expectExit();

  expect(await sheet).toEqual(
    err({
      code: 'scan_failed',
      message: 'DeskPro setProfile failed: SetScannerSetup failed (504)',
    })
  );
});

test('ends the session when the scanner will not get ready', async () => {
  const { scanner, daemons } = setUpScanner();
  const sheet = scanner.startBatch().scanSheet();

  const daemon = await daemons.next();
  await daemon.expectConnect();
  daemon.respondOk();
  await daemon.expectCommand({ kind: 'setProfile', profile: PROFILE });
  daemon.respondOk();
  await daemon.expectCommand({ kind: 'setReady', ready: true });
  daemon.respondError('notConnected', 'scanner not connected');
  await daemon.expectExit();

  expect(await sheet).toEqual(
    err({
      code: 'scan_failed',
      message: 'DeskPro setReady failed: scanner not connected',
    })
  );
});

test('kills the daemon when it cannot exit cleanly', async () => {
  const { scanner, daemons } = setUpScanner();
  const batch = scanner.startBatch();
  const sheet = batch.scanSheet();

  const daemon = await daemons.next();
  await daemon.expectOpenSession();
  expect(await sheet).toEqual(NOT_SUPPORTED);

  const ended = batch.endBatch();
  await daemon.expectCommand({ kind: 'exit' });
  daemon.respondError('other', 'exit failed');
  await ended;
});

test('kills the daemon when it does not answer exit in time', async () => {
  const { scanner, daemons } = setUpScanner({ exitTimeoutMs: 1 });
  const batch = scanner.startBatch();
  const sheet = batch.scanSheet();

  const daemon = await daemons.next();
  await daemon.expectOpenSession();
  expect(await sheet).toEqual(NOT_SUPPORTED);

  const ended = batch.endBatch();
  await daemon.expectCommand({ kind: 'exit' });
  await ended;
});

test('kills the daemon when it answers exit but does not go in time', async () => {
  const { scanner, daemons } = setUpScanner({ exitTimeoutMs: 1 });
  const batch = scanner.startBatch();
  const sheet = batch.scanSheet();

  const daemon = await daemons.next();
  await daemon.expectOpenSession();
  expect(await sheet).toEqual(NOT_SUPPORTED);

  const ended = batch.endBatch();
  await daemon.expectCommand({ kind: 'exit' });
  daemon.respondOk();
  await ended;
});

test('kills a daemon that never says hello', async () => {
  const { scanner, daemons } = setUpScanner({ setupTimeoutMs: 1 });
  const sheet = scanner.startBatch().scanSheet();

  const daemon = await daemons.next();

  expect(await sheet).toEqual(
    err({
      code: 'scan_failed',
      message: 'DeskPro did not respond during setup',
    })
  );
  daemon.expectNoMoreCommands();
  expect(daemons.count()).toEqual(1);
});

test('kills a daemon that never answers a setup command', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const { scanner, daemons } = setUpScanner({ setupTimeoutMs: 30_000 });
  const batch = scanner.startBatch();
  const sheet = batch.scanSheet();

  const daemon = await daemons.next();
  await daemon.expectConnect();
  daemon.respondOk();
  await daemon.expectCommand({ kind: 'setProfile', profile: PROFILE });
  await vi.advanceTimersByTimeAsync(30_000);

  expect(await sheet).toEqual(
    err({
      code: 'scan_failed',
      message: 'DeskPro did not respond during setup',
    })
  );
  await batch.endBatch();
  daemon.expectNoMoreCommands();
});
