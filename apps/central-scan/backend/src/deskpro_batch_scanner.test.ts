import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { expect, onTestFinished, test, vi } from 'vitest';
import { type Device, isDeviceAttached } from '@votingworks/backend';
import { err, ok } from '@votingworks/basics';
import {
  type Command,
  ControlType,
  createMockDaemon,
  type DaemonEvent,
  type ErrorCodeName,
  type ImageHeader,
  type MockScannerDaemon,
  ScannerClient,
  ScannerState,
  ScanSide,
  VX_PROFILE_PATH,
} from '@votingworks/deskpro-scanner';
import type { BatchControl, BatchScannerError } from './batch_scanner.js';
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

const NO_MORE_SHEETS = ok(undefined);
/** A control type the feed doesn't act on. */
const CTYPE_FEEDERNEXT = 31;

const WAIT_OPTIONS = { interval: 1 } as const;
const PROFILE = readFileSync(VX_PROFILE_PATH, 'utf8');

function imageHeader(seqId: number, scanSide: number): ImageHeader {
  return {
    seqId,
    streamId: 0,
    scanSide,
    resolution: 200,
    pixelsPerLine: 1700,
    lines: 2800,
    bytesPerLine: 1700,
    bitsPerPixel: 8,
    fileFormat: 4,
    compression: 0,
    doubleFeed: 0,
    blankPage: 0,
    integrity: 0,
    counters: [0, 0, 0, 0],
  };
}

function control(controlType: number, numData = 0, strData = ''): DaemonEvent {
  return { kind: 'control', controlType, numData, strData };
}

function sheetImages(seqId: number) {
  return ok({
    images: [
      { encoded: Buffer.from(`front ${seqId}`) },
      { encoded: Buffer.from(`back ${seqId}`) },
    ],
  });
}

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

  /** Answers the feeder check and, when the feeder is loaded, `scanStart`. */
  async expectStartScan({ feederLoaded = true } = {}): Promise<void> {
    await this.expectCommand({ kind: 'getStatus' });
    this.respondFeederStatus(feederLoaded);
    if (feederLoaded) {
      await this.expectCommand({ kind: 'scanStart' });
      this.respondOk();
    }
  }

  respondFeederStatus(feederLoaded: boolean): void {
    this.mock.respondStatus({
      state: ScannerState.Ready,
      operationalState: 1,
      imagesAvailable: 0,
      feederLoaded: feederLoaded ? 1 : 0,
      nextFeederLoaded: 0,
      feederSide: 0,
    });
  }

  sendEvent(event: DaemonEvent): void {
    this.mock.sendEvent(event);
  }

  sendSide(seqId: number, scanSide: number): void {
    this.mock.sendImage(
      imageHeader(seqId, scanSide),
      Buffer.from(`${scanSide === ScanSide.Front ? 'front' : 'back'} ${seqId}`)
    );
  }

  sendSheet(seqId: number): void {
    this.sendSide(seqId, ScanSide.Front);
    this.sendSide(seqId, ScanSide.Back);
  }

  /** Reports the end of a batch the way the scanner does: feeder empty, then ready. */
  sendBatchEnd(): void {
    this.sendEvent(control(ControlType.Feeder, 0));
    this.sendEvent(control(ControlType.Status, ScannerState.Ready));
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
    batchEndGraceMs: 0,
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
  await daemon.expectStartScan({ feederLoaded: false });
  expect(await firstSheet).toEqual(NO_MORE_SHEETS);

  expect(await batch.scanSheet()).toEqual(NO_MORE_SHEETS);
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
    await daemon.expectStartScan({ feederLoaded: false });
    expect(await sheet).toEqual(NO_MORE_SHEETS);
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
  await daemon.expectStartScan({ feederLoaded: false });
  expect(await sheet).toEqual(NO_MORE_SHEETS);

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
  await daemon.expectStartScan({ feederLoaded: false });
  expect(await sheet).toEqual(NO_MORE_SHEETS);

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
  await daemon.expectStartScan({ feederLoaded: false });
  expect(await sheet).toEqual(NO_MORE_SHEETS);

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
  await daemon.expectStartScan({ feederLoaded: false });
  expect(await sheet).toEqual(NO_MORE_SHEETS);

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

async function startFeeding(
  options: Partial<DeskProBatchScannerOptions> = {}
): Promise<{
  batch: BatchControl;
  daemon: ScriptedDaemon;
  firstSheet: ReturnType<BatchControl['scanSheet']>;
}> {
  const { scanner, daemons } = setUpScanner(options);
  const batch = scanner.startBatch();
  const firstSheet = batch.scanSheet();
  const daemon = await daemons.next();
  await daemon.expectOpenSession();
  await daemon.expectStartScan();
  daemon.sendEvent(control(ControlType.Status, ScannerState.Scanning));
  return { batch, daemon, firstSheet };
}

async function expectEndWithoutStopping(
  batch: BatchControl,
  daemon: ScriptedDaemon
): Promise<void> {
  const ended = batch.endBatch();
  await daemon.expectExit();
  await ended;
  daemon.expectNoMoreCommands();
}

async function expectEndAfterStopping(
  batch: BatchControl,
  daemon: ScriptedDaemon
): Promise<void> {
  const ended = batch.endBatch();
  await daemon.expectCommand({ kind: 'scanStop' });
  daemon.respondOk();
  await daemon.expectExit();
  await ended;
  daemon.expectNoMoreCommands();
}

test('pairs each sheet’s sides and ends once the feeder is empty and the scanner ready', async () => {
  const { batch, daemon, firstSheet } = await startFeeding();

  daemon.sendSheet(1);
  expect(await firstSheet).toEqual(sheetImages(1));

  daemon.sendSide(2, ScanSide.Back);
  daemon.sendEvent(control(ControlType.Feeder, 0));
  daemon.sendSide(2, ScanSide.Front);
  expect(await batch.scanSheet()).toEqual(sheetImages(2));

  daemon.sendEvent(control(ControlType.Status, ScannerState.Ready));
  expect(await batch.scanSheet()).toEqual(NO_MORE_SHEETS);
  expect(await batch.scanSheet()).toEqual(NO_MORE_SHEETS);

  await expectEndWithoutStopping(batch, daemon);
});

test('also ends when the scanner goes ready before reporting the feeder empty', async () => {
  const { batch, daemon, firstSheet } = await startFeeding();

  daemon.sendSheet(1);
  daemon.sendEvent(control(ControlType.Status, ScannerState.Ready));
  daemon.sendEvent(control(ControlType.Feeder, 0));
  expect(await firstSheet).toEqual(sheetImages(1));
  expect(await batch.scanSheet()).toEqual(NO_MORE_SHEETS);

  await expectEndWithoutStopping(batch, daemon);
});

test('waits briefly for trailing images once the batch looks finished', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const { batch, daemon, firstSheet } = await startFeeding({
    batchEndGraceMs: 1_000,
  });

  daemon.sendBatchEnd();
  daemon.sendSheet(1);
  expect(await firstSheet).toEqual(sheetImages(1));

  const end = batch.scanSheet();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(await end).toEqual(NO_MORE_SHEETS);

  await expectEndWithoutStopping(batch, daemon);
});

test('ignores events that do not bear on the batch', async () => {
  const { batch, daemon, firstSheet } = await startFeeding();

  daemon.sendEvent({ kind: 'log', message: 'hello' });
  daemon.sendEvent({ kind: 'operationalState', state: 1 });
  daemon.sendEvent(control(ControlType.Error, 0));
  daemon.sendEvent(control(CTYPE_FEEDERNEXT, 0, 'Next feeder empty'));
  daemon.sendEvent(control(ControlType.Status, ScannerState.Ready));
  daemon.sendSheet(1);
  expect(await firstSheet).toEqual(sheetImages(1));

  daemon.sendBatchEnd();
  expect(await batch.scanSheet()).toEqual(NO_MORE_SHEETS);
  daemon.sendSheet(2);
  expect(await batch.scanSheet()).toEqual(NO_MORE_SHEETS);

  await expectEndWithoutStopping(batch, daemon);
});

test('stops the scan when the batch ends while the scanner is feeding', async () => {
  const { batch, daemon, firstSheet } = await startFeeding();
  daemon.sendSheet(1);
  expect(await firstSheet).toEqual(sheetImages(1));

  const ended = batch.endBatch();
  await daemon.expectCommand({ kind: 'scanStop' });
  daemon.respondOk();
  await daemon.expectExit();
  await ended;
});

test.each<[string, number, BatchScannerError['code']]>([
  ['an interlock', ControlType.ScanErrorInterlock, 'cover_open'],
  ['a jam', ControlType.ScanErrorPaperJam, 'jammed'],
  ['a double feed', ControlType.ScanErrorDoubleFeed, 'jammed'],
  ['paper inside', ControlType.ScanErrorPaperInside, 'scan_failed'],
  ['an unknown scan error', ControlType.ScanErrorUnknown, 'scan_failed'],
])(
  'delivers sheets scanned before %s, then the error',
  async (_name, controlType, code) => {
    const { batch, daemon, firstSheet } = await startFeeding();

    daemon.sendSheet(1);
    daemon.sendSide(2, ScanSide.Front);
    daemon.sendEvent(control(controlType, 0, '263'));
    expect(await firstSheet).toEqual(sheetImages(1));
    expect(await batch.scanSheet()).toEqual(
      err({
        code,
        message: `DeskPro reported scan error ${controlType} (scanner code 263)`,
      })
    );

    await expectEndAfterStopping(batch, daemon);
  }
);

test.each<[string, (daemon: ScriptedDaemon) => void, string]>([
  [
    'the scanner is lost',
    (daemon) =>
      daemon.sendEvent({ kind: 'disconnected', message: 'read error 50' }),
    'DeskPro disconnected: read error 50',
  ],
  [
    'an image is too large',
    (daemon) =>
      daemon.sendEvent({
        kind: 'oversizedImage',
        seqId: 1,
        scanSide: ScanSide.Front,
        size: 2 ** 30,
      }),
    'DeskPro sent an unusable image (oversizedImage)',
  ],
  [
    'an image cannot be read',
    (daemon) => daemon.sendEvent({ kind: 'incompatibleImage', size: 12 }),
    'DeskPro sent an unusable image (incompatibleImage)',
  ],
  [
    'the driver reports an error',
    (daemon) => daemon.sendEvent(control(ControlType.Error, 57)),
    'DeskPro driver error 57',
  ],
  [
    'an image has an unknown side',
    (daemon) => daemon.sendSide(1, 7),
    'DeskPro sent an image for unknown side 7',
  ],
])('fails the batch when %s', async (_name, act, message) => {
  const { batch, daemon, firstSheet } = await startFeeding();

  act(daemon);
  expect(await firstSheet).toEqual(err({ code: 'scan_failed', message }));

  await expectEndAfterStopping(batch, daemon);
});

test('fails the batch when the daemon exits mid-batch', async () => {
  const { batch, daemon, firstSheet } = await startFeeding();

  daemon.close('deskproctl exited with code 3, signal null');
  expect(await firstSheet).toEqual(
    err({
      code: 'scan_failed',
      message:
        'DeskPro daemon exited: deskproctl exited with code 3, signal null',
    })
  );
  await batch.endBatch();
});

test.each<['getStatus' | 'scanStart']>([['getStatus'], ['scanStart']])(
  'ends the session when %s fails',
  async (step) => {
    const { scanner, daemons } = setUpScanner();
    const batch = scanner.startBatch();
    const sheet = batch.scanSheet();
    const daemon = await daemons.next();
    await daemon.expectOpenSession();

    if (step === 'scanStart') {
      await daemon.expectCommand({ kind: 'getStatus' });
      daemon.respondFeederStatus(true);
    }
    await daemon.expectCommand({ kind: step });
    daemon.respondError('driver', `${step} failed (501)`);
    await daemon.expectExit();

    expect(await sheet).toEqual(
      err({
        code: 'scan_failed',
        message: `DeskPro ${step} failed: ${step} failed (501)`,
      })
    );
    await batch.endBatch();
    daemon.expectNoMoreCommands();
  }
);

test('fails the batch when a sheet is missing a side at the end', async () => {
  const { batch, daemon, firstSheet } = await startFeeding();

  daemon.sendSheet(1);
  daemon.sendSide(2, ScanSide.Front);
  daemon.sendBatchEnd();
  expect(await firstSheet).toEqual(sheetImages(1));
  expect(await batch.scanSheet()).toEqual(
    err({
      code: 'scan_failed',
      message: 'DeskPro sent only one side of sheet 2',
    })
  );

  await expectEndWithoutStopping(batch, daemon);
});

test('keeps the batch open if scanning resumes during the grace period', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const { batch, daemon, firstSheet } = await startFeeding({
    batchEndGraceMs: 1_000,
  });

  daemon.sendBatchEnd();
  daemon.sendEvent(control(ControlType.Feeder, 1));
  daemon.sendEvent(control(ControlType.Status, ScannerState.Scanning));
  await vi.advanceTimersByTimeAsync(1_000);
  daemon.sendSheet(1);
  expect(await firstSheet).toEqual(sheetImages(1));

  daemon.sendBatchEnd();
  const end = batch.scanSheet();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(await end).toEqual(NO_MORE_SHEETS);

  await expectEndWithoutStopping(batch, daemon);
});

test('kills the daemon when starting the scan does not answer', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const { scanner, daemons } = setUpScanner({ setupTimeoutMs: 30_000 });
  const batch = scanner.startBatch();
  const sheet = batch.scanSheet();
  const daemon = await daemons.next();
  await daemon.expectOpenSession();
  await daemon.expectCommand({ kind: 'getStatus' });
  await vi.advanceTimersByTimeAsync(30_000);

  expect(await sheet).toEqual(
    err({
      code: 'scan_failed',
      message: 'DeskPro did not respond while starting the scan',
    })
  );
  await batch.endBatch();
  daemon.expectNoMoreCommands();
});
