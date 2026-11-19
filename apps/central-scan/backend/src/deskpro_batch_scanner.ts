import { readFile } from 'node:fs/promises';
import { err, ok, type Result, sleep, timeout } from '@votingworks/basics';
import { isDeviceAttached } from '@votingworks/backend';
import {
  type ScannerClient,
  type ScannerError,
  VX_PROFILE_PATH,
} from '@votingworks/deskpro-scanner';
import type {
  BatchControl,
  BatchScanner,
  BatchScannerError,
} from './batch_scanner.js';
import {
  DEFAULT_BATCH_END_GRACE_MS,
  DeskProBatchFeed,
} from './deskpro_batch_feed.js';

export const INOTEC_VENDOR_ID = 0x2bcc;
export const INOTEC_DESKPRO_PRODUCT_ID = 0x0001;

export const DESKPRO_APP_ID = 'VxCentralScan';

/** The scanner refuses connections for 10–15 s after a client exits without disconnecting. */
export const DEFAULT_CONNECT_ATTEMPTS = 10;
export const DEFAULT_CONNECT_RETRY_DELAY_MS = 2_000;
export const DEFAULT_SETUP_TIMEOUT_MS = 30_000;
export const DEFAULT_EXIT_TIMEOUT_MS = 5_000;

export interface DeskProBatchScannerOptions {
  readonly createClient: () => ScannerClient;
  readonly profilePath?: string;
  readonly connectAttempts?: number;
  readonly connectRetryDelayMs?: number;
  readonly setupTimeoutMs?: number;
  readonly exitTimeoutMs?: number;
  readonly batchEndGraceMs?: number;
}

interface Session {
  readonly client: ScannerClient;
  readonly feed: DeskProBatchFeed;
  readonly closed: Promise<void>;
}

interface SetupError {
  readonly step: string;
  readonly error: ScannerError;
}

function scanFailed(step: string, error: ScannerError): BatchScannerError {
  return {
    code: 'scan_failed',
    message: `DeskPro ${step} failed: ${error.message}`,
  };
}

function startSession(client: ScannerClient, batchEndGraceMs: number): Session {
  const closed = new Promise<void>((resolve) => {
    client.once('close', () => resolve());
  });
  return {
    client,
    feed: new DeskProBatchFeed(client, batchEndGraceMs),
    closed,
  };
}

/** Stops the daemon, which disconnects from the scanner first, and waits for it to go. */
async function killSession({ client, closed }: Session): Promise<void> {
  client.stop();
  await closed;
}

/** Asks the daemon to disconnect and exit, killing it if it can't in time, and waits for it to go. */
async function endSession(session: Session, timeoutMs: number): Promise<void> {
  const exited = await timeout(
    timeoutMs,
    session.client.exit().then(async (result) => {
      if (result.isOk()) await session.closed;
      return result;
    })
  );
  if (exited.type === 'timeout' || exited.value.isErr()) {
    await killSession(session);
  }
}

/**
 * A {@link BatchScanner} for the InoTec SCAMAX DeskPro. Each batch runs its own `deskproctl`
 * session, since only a fresh process reliably reconnects after the scanner is lost.
 */
export class DeskProBatchScanner implements BatchScanner {
  private readonly createClient: () => ScannerClient;
  private readonly profilePath: string;
  private readonly connectAttempts: number;
  private readonly connectRetryDelayMs: number;
  private readonly setupTimeoutMs: number;
  private readonly exitTimeoutMs: number;
  private readonly batchEndGraceMs: number;

  constructor({
    createClient,
    profilePath = VX_PROFILE_PATH,
    connectAttempts = DEFAULT_CONNECT_ATTEMPTS,
    connectRetryDelayMs = DEFAULT_CONNECT_RETRY_DELAY_MS,
    setupTimeoutMs = DEFAULT_SETUP_TIMEOUT_MS,
    exitTimeoutMs = DEFAULT_EXIT_TIMEOUT_MS,
    batchEndGraceMs = DEFAULT_BATCH_END_GRACE_MS,
  }: DeskProBatchScannerOptions) {
    this.createClient = createClient;
    this.profilePath = profilePath;
    this.connectAttempts = connectAttempts;
    this.connectRetryDelayMs = connectRetryDelayMs;
    this.setupTimeoutMs = setupTimeoutMs;
    this.exitTimeoutMs = exitTimeoutMs;
    this.batchEndGraceMs = batchEndGraceMs;
  }

  isAttached(): boolean {
    return isDeviceAttached(
      ({ deviceDescriptor }) =>
        deviceDescriptor.idVendor === INOTEC_VENDOR_ID &&
        deviceDescriptor.idProduct === INOTEC_DESKPRO_PRODUCT_ID
    );
  }

  isImprinterDetected(): Promise<boolean> {
    return Promise.resolve(false);
  }

  startBatch(): BatchControl {
    let opening: Promise<Result<Session, BatchScannerError>> | undefined;

    return {
      scanSheet: async () => {
        opening ??= this.openSession().then((opened) =>
          opened.isOk() ? this.startFeeding(opened.ok()) : opened
        );
        const opened = await opening;
        if (opened.isErr()) {
          return opened;
        }
        return opened.ok().feed.next();
      },

      // TODO: stop the feed at pauses and review stops (`scanPause`, or one
      // sheet per `scanStart`) so a resumed batch doesn't drop queued sheets.
      endBatch: async () => {
        const opened = await opening;
        if (opened?.isOk()) {
          const session = opened.ok();
          if (session.feed.isScanning()) {
            await timeout(this.exitTimeoutMs, session.client.scanStop());
          }
          await endSession(session, this.exitTimeoutMs);
        }
      },
    };
  }

  private async openSession(): Promise<Result<Session, BatchScannerError>> {
    const profile = await readFile(this.profilePath, 'utf8');

    for (let attempt = 1; ; attempt += 1) {
      const session = startSession(this.createClient(), this.batchEndGraceMs);
      const setUpResult = await timeout(
        this.setupTimeoutMs,
        this.setUp(session.client, profile)
      );
      if (setUpResult.type === 'timeout') {
        await killSession(session);
        return err({
          code: 'scan_failed',
          message: 'DeskPro did not respond during setup',
        });
      }
      const setUp = setUpResult.value;
      if (setUp.isOk()) {
        return ok(session);
      }

      await endSession(session, this.exitTimeoutMs);
      const { step, error } = setUp.err();
      if (
        step !== 'connect' ||
        error.code !== 'scannerInUse' ||
        attempt >= this.connectAttempts
      ) {
        return err(scanFailed(step, error));
      }
      await sleep(this.connectRetryDelayMs);
    }
  }

  /** Starts feeding, or ends the feed at once if the feeder is empty; ends the session on failure. */
  private async startFeeding(
    session: Session
  ): Promise<Result<Session, BatchScannerError>> {
    const startResult = await timeout(
      this.setupTimeoutMs,
      this.startScan(session)
    );
    if (startResult.type === 'timeout') {
      await killSession(session);
      return err({
        code: 'scan_failed',
        message: 'DeskPro did not respond while starting the scan',
      });
    }
    const started = startResult.value;
    if (started.isErr()) {
      await endSession(session, this.exitTimeoutMs);
      const { step, error } = started.err();
      return err(scanFailed(step, error));
    }
    return ok(session);
  }

  private async startScan({
    client,
    feed,
  }: Session): Promise<Result<void, SetupError>> {
    const status = await client.getStatus();
    if (status.isErr()) {
      return err({ step: 'getStatus', error: status.err() });
    }
    if (status.ok().feederLoaded === 0) {
      feed.finish();
      return ok();
    }
    const started = await client.scanStart();
    if (started.isErr()) {
      return err({ step: 'scanStart', error: started.err() });
    }
    feed.started();
    return ok();
  }

  private async setUp(
    client: ScannerClient,
    profile: string
  ): Promise<Result<void, SetupError>> {
    const started = await client.start();
    if (started.isErr()) {
      return err({ step: 'connect', error: started.err() });
    }
    const connected = await client.connect(DESKPRO_APP_ID);
    if (connected.isErr()) {
      return err({ step: 'connect', error: connected.err() });
    }
    const profileSet = await client.setProfile(profile);
    if (profileSet.isErr()) {
      return err({ step: 'setProfile', error: profileSet.err() });
    }
    const ready = await client.setReady(true);
    if (ready.isErr()) {
      return err({ step: 'setReady', error: ready.err() });
    }
    return ok();
  }
}
