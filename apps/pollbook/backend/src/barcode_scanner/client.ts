import * as net from 'node:net';
import { lines, Optional, sleep } from '@votingworks/basics';
import { safeParseJson } from '@votingworks/types';
import {
  Logger,
  LogEventId,
  LogDispositionStandardTypes,
} from '@votingworks/logging';
import { lstat } from 'node:fs/promises';
import {
  AamvaDocument,
  BarcodeScannerError,
  BarcodeScannerPayload,
  BarcodeScannerPayloadSchema,
  isAamvaDocument,
} from '../types';
import { tryConnect } from './unix_socket';

export const UDS_CONNECTION_ATTEMPT_DELAY_MS = 1000;
export const UDS_CONNECTION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const DEVICE_PATH = '/dev/barcode_scanner';

/**
 * Attempts to connect to the barcode scanner Unix socket within a retry loop.
 * Allows failure to connect so the app can fall back gracefully.
 */
export async function connectToBarcodeScannerSocket(
  logger: Logger
): Promise<Optional<net.Socket>> {
  await logger.logAsCurrentRole(LogEventId.SocketClientConnectInit, {
    message: 'Connection to barcode scanner daemon UDS initiated',
  });
  const connectStart = new Date();
  while (
    new Date().getTime() - connectStart.getTime() <
    UDS_CONNECTION_TIMEOUT_MS
  ) {
    try {
      return await tryConnect(logger);
    } catch (e) {
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
    private scannedDocument: Optional<AamvaDocument> = undefined,
    private error: Optional<BarcodeScannerError> = undefined,
    private connectedToDaemon = false,
    private readonly devicePath = DEVICE_PATH
  ) {}

  // Returns the latest payload from the barcode scanner daemon, consuming it in the process,
  // or undefined if there isn't one.
  readPayload(): Optional<BarcodeScannerPayload> {
    const payload = this.scannedDocument ?? this.error ?? undefined;
    if (payload) {
      this.scannedDocument = undefined;
      this.error = undefined;
    }
    return payload;
  }

  async isConnected(): Promise<boolean> {
    try {
      // udev rule sets up an alias for the serial USB device. Each time the device
      // is connected a symlink is created at this path and each time it's disconnected
      // the symlink is deleted. Therefore we can check for existence of the symlink
      // to know whether the device is plugged in.
      const deviceFound = !!(await lstat(this.devicePath));
      return deviceFound && this.connectedToDaemon;
    } catch (err: unknown) {
      const typedError = err as NodeJS.ErrnoException;
      if (typedError.code !== 'ENOENT') {
        await this.logger.logAsCurrentRole(LogEventId.UnknownError, {
          message: 'Unknown error trying to lstat barcode scanner',
          error: (err as Error).message,
        });
      }

      return false;
    }
  }

  private scheduleReconnect(): void {
    setTimeout(() => this.listen(), UDS_CONNECTION_ATTEMPT_DELAY_MS);
  }

  /**
   * Opens the UDS connection, reads scan lines, and re-emits them over Socket.IO.
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

    for await (const line of lines(udsClient)) {
      try {
        const result = safeParseJson(line, BarcodeScannerPayloadSchema);
        if (result.isErr()) {
          await this.logger.logAsCurrentRole(LogEventId.ParseError, {
            message: 'Could not parse barcode scanner message',
            error: result.err().message,
          });
          continue;
        }

        const parsed = result.ok();
        if (isAamvaDocument(parsed)) {
          this.scannedDocument = parsed;
        } else {
          this.error = parsed;
        }
      } catch (error) {
        await this.logger.logAsCurrentRole(LogEventId.ParseError, {
          message: 'Could not read line from barcode scanner daemon UDS',
          error: (error as Error).message,
        });
      }
    }
  }
}
