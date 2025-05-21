import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import express from 'express';
import { CITIZEN_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import {
  BaseLogger,
  LogDispositionStandardTypes,
  LogEventId,
  Logger,
  LogSource,
} from '@votingworks/logging';
import { Server as IoServer } from 'socket.io';
import * as net from 'node:net';
import { safeParseJson } from '@votingworks/types';
import { Optional, sleep } from '@votingworks/basics';
import { buildLocalApp } from './app';
import { LOCAL_PORT } from './globals';
import { AamvaDocumentSchema, LocalAppContext } from './types';
import { getUserRole } from './auth';

const UDS_PATH = '/tmp/barcodescannerd.sock';
const UDS_CONNECTION_ATTEMPT_DELAY_MS = 1000;
const UDS_CONNECTION_TIMEOUT_MS = 60 * 1000;

// Attempts to connect to the barcode scanner Unix socket once. Resolves with
// the socket client if successful or rejects with an error.
function tryConnect(logger: Logger, io: IoServer): Promise<net.Socket> {
  return new Promise<net.Socket>((resolve, reject) => {
    const client = net.createConnection({
      path: UDS_PATH,
    });

    client.on('error', () => {
      const message =
        'Pollbook backend failed to connect to barcode scanner Unix socket';
      logger.log(LogEventId.SocketClientConnect, 'system', {
        message,
        disposition: LogDispositionStandardTypes.Failure,
      });

      client.destroy();
      reject(new Error(message));
    });

    client.on('connect', () => {
      client.setEncoding('utf8');

      client.on('data', (chunk: string) => {
        if (chunk.length === 0) {
          return;
        }

        const result = safeParseJson(chunk, AamvaDocumentSchema);
        if (result.isErr()) {
          void logger.logAsCurrentRole(LogEventId.ParseError, {
            message: 'Could not parse barcode scan as AAMVA Document',
            error: result.err().message,
          });
        }

        const doc = result.ok();
        io.emit('barcode-scan', doc);
      });

      // We're no longer attempting to connect so the error message should change
      client.removeListener('error', () => {
        client.on('error', (err) => {
          logger.log(LogEventId.SocketClientError, 'system', {
            message: 'Pollbook UDS client received an error',
            error: err.message,
            disposition: LogDispositionStandardTypes.Failure,
          });
        });
      });

      logger.log(LogEventId.SocketClientConnect, 'system', {
        message: 'Pollbook backend connected to barcode scanner Unix socket',
        disposition: LogDispositionStandardTypes.Success,
      });

      resolve(client);
    });
  });
}

/**
 * Attempts to connect to the barcode scanner Unix socket within a retry loop.
 * Allows failure to connect so the app can fall back gracefully.
 */
async function connectToBarcodeScannerSocket(
  logger: Logger,
  io: IoServer
): Promise<Optional<net.Socket>> {
  const connectStart = new Date();
  while (
    new Date().getTime() - connectStart.getTime() <
    UDS_CONNECTION_TIMEOUT_MS
  ) {
    try {
      return await tryConnect(logger, io);
    } catch (e) {
      await sleep(UDS_CONNECTION_ATTEMPT_DELAY_MS);
    }
  }

  logger.log(LogEventId.SocketClientConnect, 'system', {
    message: 'Exhausted UDS connection attempts',
    disposition: LogDispositionStandardTypes.Failure,
  });
}

/**
 * Starts the server.
 */
export async function start(context: LocalAppContext): Promise<void> {
  const baseLogger = new BaseLogger(LogSource.VxPollbookBackend);
  const logger = Logger.from(baseLogger, () =>
    getUserRole(context.auth, context.workspace)
  );

  const app = buildLocalApp({ context, logger });

  useDevDockRouter(app, express, {
    printerConfig: CITIZEN_THERMAL_PRINTER_CONFIG,
  });

  const server = app.listen(LOCAL_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(
      `VxPollbook backend running at http://localhost:${LOCAL_PORT}/`
    );
  });
  const serverAddress = server.address() as net.AddressInfo;

  // Set up socket.io server for communication with frontend
  const io = new IoServer(server, {
    cors: { origin: 'http://localhost:3000' },
  });
  io.on('connection', (socket) => {
    logger.log(LogEventId.SocketClientConnect, 'system', {
      message: `Pollbook socket.io client connected to [${serverAddress.address}]:${serverAddress.port}`,
      disposition: LogDispositionStandardTypes.Success,
    });
    socket.on('disconnect', () => {
      logger.log(LogEventId.SocketClientDisconnect, 'system', {
        message: `Pollbook socket.io client disconnected from [${serverAddress.address}]:${serverAddress.port}`,
        disposition: LogDispositionStandardTypes.Success,
      });
    });
  });

  // Set up client for Unix socket managed by barcode scanner daemon
  await connectToBarcodeScannerSocket(logger, io);
}
