import * as net from 'node:net';
import { lines, Optional, sleep } from '@votingworks/basics';
import { safeParseJson } from '@votingworks/types';
import {
  Logger,
  LogEventId,
  LogDispositionStandardTypes,
} from '@votingworks/logging';
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

  /* istanbul ignore next - @preserve */
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
    private error: Optional<BarcodeScannerError> = undefined
  ) {}

  // Returns the latest payload from the barcode scanner daemon, consuming it in the process,
  // or undefined if there isn't one.
  readPayload(): Optional<BarcodeScannerPayload> {
    /* istanbul ignore next - @preserve */
    const payload = this.scannedDocument ?? this.error ?? undefined;
    /* istanbul ignore next - @preserve */
    if (payload) {
      /* istanbul ignore next - @preserve */
      this.scannedDocument = undefined;
      /* istanbul ignore next - @preserve */
      this.error = undefined;
    }
    /* istanbul ignore next - @preserve */
    return payload;
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
      /* istanbul ignore next - @preserve */
      return;
    }

    // 'close' event covers both clean socket shutdown and close due to error
    udsClient.on('close', () => {
      this.logger.log(LogEventId.SocketClientDisconnected, 'system', {
        message: 'UDS socket closed',
        disposition: LogDispositionStandardTypes.Success,
      });
      this.scheduleReconnect();
    });

    for await (const line of lines(udsClient)) {
      try {
        const result = safeParseJson(line, BarcodeScannerPayloadSchema);
        /* istanbul ignore next - @preserve */
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
        /* istanbul ignore next - @preserve */
        await this.logger.logAsCurrentRole(LogEventId.ParseError, {
          message: 'Could not read line from barcode scanner daemon UDS',
          error: (error as Error).message,
        });
      }
    }
  }
}
