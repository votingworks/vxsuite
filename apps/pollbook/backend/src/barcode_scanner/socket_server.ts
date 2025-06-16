import { Server as IoServer } from 'socket.io';
import * as net from 'node:net';
import { lines, Optional, sleep } from '@votingworks/basics';
import { safeParseJson } from '@votingworks/types';
import {
  Logger,
  LogEventId,
  LogDispositionStandardTypes,
} from '@votingworks/logging';
import type { Server as HttpServer } from 'node:http';
import { AamvaDocumentSchema } from '../types';
import { tryConnect } from './unix_socket';

export const UDS_CONNECTION_ATTEMPT_DELAY_MS = 1000;
export const UDS_CONNECTION_TIMEOUT_MS = 60 * 1000;

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
 * Encapsulates 2 different socket connections for interacting with the barcode scanner.
 */
export class SocketServer {
  private readonly io: IoServer;

  constructor(
    httpServer: HttpServer,
    private readonly logger: Logger
  ) {
    this.io = new IoServer(httpServer, {
      cors: { origin: 'http://localhost:3000' },
    });

    this.io.on('connection', (socket) => {
      const addressInfo = httpServer.address() as net.AddressInfo;
      this.logger.log(LogEventId.SocketClientConnected, 'system', {
        message: `Pollbook socket.io client connected to [${addressInfo.address}]:${addressInfo.port}`,
        disposition: LogDispositionStandardTypes.Success,
      });

      socket.on('disconnect', () => {
        this.logger.log(LogEventId.SocketClientDisconnected, 'system', {
          message: `Pollbook socket.io client disconnected from [${addressInfo.address}]:${addressInfo.port}`,
          disposition: LogDispositionStandardTypes.Success,
        });
      });
    });
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
        const result = safeParseJson(line, AamvaDocumentSchema);
        if (result.isErr()) {
          await this.logger.logAsCurrentRole(LogEventId.ParseError, {
            message: 'Could not parse barcode scan as AAMVA Document',
            error: result.err().message,
          });
        } else {
          this.io.emit('barcode-scan', result.ok());
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
