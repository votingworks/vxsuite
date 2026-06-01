import * as net from 'node:net';
import { lines, Optional, Result, err, ok, sleep } from '@votingworks/basics';
import {
  Logger,
  LogEventId,
  LogDispositionStandardTypes,
} from '@votingworks/logging';
import { lstat } from 'node:fs/promises';
import { BallotStyleQrCode, BallotStyleQrCodeSchema } from '@votingworks/types';
import { BarcodeScannerError, BarcodeScannerErrorSchema } from '../types';
import { tryConnect } from './unix_socket';

export const UDS_CONNECTION_ATTEMPT_DELAY_MS = 1000;
export const UDS_CONNECTION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const DEVICE_PATH = '/dev/barcode_scanner';

// The time scan data will live before it's cleaned up.
// Because only certain pages in the frontend handle barcode scans,
// we don't want stale scans to sit around in memory to be read
// later when the user has no context on the scan.
// The duration should be >= client polling interval for scan data
export const SCAN_DATA_TTL_MS = 1000;

export type BarcodeScannerPayload = BallotStyleQrCode | BarcodeScannerError;

function parseBarcodeScannerLine(
  line: string
): Result<BarcodeScannerPayload, Error> {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch (e) {
    return err(new Error(`Invalid JSON: ${(e as Error).message}`));
  }

  const infoResult = BallotStyleQrCodeSchema.safeParse(raw);
  if (infoResult.success) {
    return ok(infoResult.data);
  }

  const errorResult = BarcodeScannerErrorSchema.safeParse(raw);
  if (errorResult.success) {
    return ok(errorResult.data);
  }

  return err(
    new Error(
      `Does not match BallotStyleQrCode or error: ${infoResult.error.message}`
    )
  );
}

function isBarcodeScannerError(
  payload: BarcodeScannerPayload
): payload is BarcodeScannerError {
  return BarcodeScannerErrorSchema.safeParse(payload).success;
}

/**
 * Attempts to connect to the barcode scanner Unix socket within a retry loop.
 * Allows failure to connect so the app can fall back gracefully.
 */
export async function connectToBarcodeScannerSocket(
  logger: Logger,
  timeoutMs: number = UDS_CONNECTION_TIMEOUT_MS
): Promise<Optional<net.Socket>> {
  await logger.logAsCurrentRole(LogEventId.SocketClientConnectInit, {
    message: 'Connection to barcode scanner daemon UDS initiated',
  });
  const connectStart = new Date();
  while (new Date().getTime() - connectStart.getTime() < timeoutMs) {
    try {
      return await tryConnect(logger);
    } catch {
      await sleep(UDS_CONNECTION_ATTEMPT_DELAY_MS);
    }
  }

  await logger.logAsCurrentRole(LogEventId.SocketClientConnected, {
    message: 'Exhausted UDS connection attempts',
    disposition: LogDispositionStandardTypes.Failure,
  });
}

/**
 * Manages the connection to the barcode scanner daemon.
 */
export class BarcodeScannerClient {
  constructor(
    private readonly logger: Logger,
    private scannedInfo: Optional<BallotStyleQrCode> = undefined,
    private error: Optional<BarcodeScannerError> = undefined,
    private connectedToDaemon = false,
    private readonly devicePath = DEVICE_PATH,
    private ttlTimeout: Optional<ReturnType<typeof setTimeout>> = undefined
  ) {}

  // Returns the latest payload from the barcode scanner daemon, consuming it in the process,
  // or undefined if there isn't one.
  readPayload(): Optional<BarcodeScannerPayload> {
    if (this.ttlTimeout) {
      clearTimeout(this.ttlTimeout);
      this.ttlTimeout = undefined;
    }
    const payload = this.scannedInfo ?? this.error ?? undefined;
    if (payload) {
      this.logger.log(LogEventId.Info, 'system', {
        message: `Barcode scanner readPayload method read: ${JSON.stringify(
          payload
        )}`,
        disposition: LogDispositionStandardTypes.Success,
      });
      this.scannedInfo = undefined;
      this.error = undefined;
    }
    return payload;
  }

  scheduleCleanup(): void {
    this.ttlTimeout = setTimeout(() => {
      this.scannedInfo = undefined;
      this.error = undefined;
    }, SCAN_DATA_TTL_MS);
  }

  async isConnected(): Promise<boolean> {
    try {
      // udev rule sets up an alias for the serial USB device. Each time the device
      // is connected a symlink is created at this path and each time it's disconnected
      // the symlink is deleted. Therefore we can check for existence of the symlink
      // to know whether the device is plugged in.
      const deviceFound = !!(await lstat(this.devicePath));
      return deviceFound && this.connectedToDaemon;
    } catch (e: unknown) {
      const typedError = e as NodeJS.ErrnoException;
      /* istanbul ignore next - @preserve */
      if (typedError.code !== 'ENOENT') {
        await this.logger.logAsCurrentRole(LogEventId.UnknownError, {
          message: 'Unknown error trying to lstat barcode scanner',
          error: (e as Error).message,
        });
      }

      return false;
    }
  }

  private scheduleReconnect(): void {
    setTimeout(() => this.listen(), UDS_CONNECTION_ATTEMPT_DELAY_MS);
  }

  /**
   * Opens the UDS connection, reads scan lines, and stores the latest payload.
   */
  async listen(): Promise<void> {
    const udsClient = await connectToBarcodeScannerSocket(this.logger);
    if (!udsClient) {
      return;
    }

    this.connectedToDaemon = true;

    // 'close' event covers both clean socket shutdown and close due to error
    udsClient.on('close', () => {
      this.logger.log(LogEventId.SocketClientDisconnected, 'system', {
        message: 'UDS socket closed',
        disposition: LogDispositionStandardTypes.Success,
      });
      this.connectedToDaemon = false;
      this.scheduleReconnect();
    });

    try {
      for await (const line of lines(udsClient)) {
        this.logger.log(LogEventId.Info, 'system', {
          message: `Received line from barcode scanner daemon UDS: ${line}`,
          disposition: LogDispositionStandardTypes.Success,
        });

        const result = parseBarcodeScannerLine(line);
        if (result.isErr()) {
          await this.logger.logAsCurrentRole(LogEventId.ParseError, {
            message: 'Could not parse barcode scanner message',
            error: result.err().message,
          });
          continue;
        }

        const parsed = result.ok();
        if (isBarcodeScannerError(parsed)) {
          this.error = parsed;
        } else {
          this.scannedInfo = parsed;
        }

        this.scheduleCleanup();
      }
    } catch (error) {
      /* istanbul ignore next - @preserve */
      await this.logger.logAsCurrentRole(LogEventId.ParseError, {
        message: 'Could not read line from barcode scanner daemon UDS',
        error: (error as Error).message,
      });
    }
  }
}
