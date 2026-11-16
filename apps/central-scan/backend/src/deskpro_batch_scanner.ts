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
}

interface Session {
  readonly client: ScannerClient;
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

function startSession(client: ScannerClient): Session {
  const closed = new Promise<void>((resolve) => {
    client.once('close', () => resolve());
  });
  return { client, closed };
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

  constructor({
    createClient,
    profilePath = VX_PROFILE_PATH,
    connectAttempts = DEFAULT_CONNECT_ATTEMPTS,
    connectRetryDelayMs = DEFAULT_CONNECT_RETRY_DELAY_MS,
    setupTimeoutMs = DEFAULT_SETUP_TIMEOUT_MS,
    exitTimeoutMs = DEFAULT_EXIT_TIMEOUT_MS,
  }: DeskProBatchScannerOptions) {
    this.createClient = createClient;
    this.profilePath = profilePath;
    this.connectAttempts = connectAttempts;
    this.connectRetryDelayMs = connectRetryDelayMs;
    this.setupTimeoutMs = setupTimeoutMs;
    this.exitTimeoutMs = exitTimeoutMs;
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
        opening ??= this.openSession();
        const opened = await opening;
        if (opened.isErr()) {
          return opened;
        }
        return err({
          code: 'scan_failed',
          message: 'Scanning with the DeskPro is not yet supported',
        });
      },

      endBatch: async () => {
        const opened = await opening;
        if (opened?.isOk()) {
          await endSession(opened.ok(), this.exitTimeoutMs);
        }
      },
    };
  }

  private async openSession(): Promise<Result<Session, BatchScannerError>> {
    const profile = await readFile(this.profilePath, 'utf8');

    for (let attempt = 1; ; attempt += 1) {
      const session = startSession(this.createClient());
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
