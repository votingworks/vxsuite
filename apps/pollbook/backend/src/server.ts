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
import { lines, Optional, sleep } from '@votingworks/basics';
import { buildLocalApp } from './app';
import { LOCAL_PORT } from './globals';
import { AamvaDocumentSchema, LocalAppContext } from './types';
import { getUserRole } from './auth';

const UDS_PATH = '/tmp/barcodescannerd.sock';
const UDS_CONNECTION_ATTEMPT_DELAY_MS = 1000;
const UDS_CONNECTION_TIMEOUT_MS = 60 * 1000;

/*
 * Attempts to connect to the barcode scanner Unix socket once. Resolves with
 * the socket client if successful or rejects with an error.
 */
function tryConnect(logger: Logger): Promise<net.Socket> {
  return new Promise<net.Socket>((resolve, reject) => {
    let isConnected = false;
    const client = net.createConnection({
      path: UDS_PATH,
    });

    client.on('error', (err) => {
      if (isConnected) {
        logger.log(LogEventId.SocketClientError, 'system', {
          message: 'Pollbook UDS client received an error',
          error: err.message,
          disposition: LogDispositionStandardTypes.Failure,
        });

        return;
      }

      const message =
        'Pollbook backend failed to connect to barcode scanner Unix socket';
      logger.log(LogEventId.SocketClientConnected, 'system', {
        message,
        disposition: LogDispositionStandardTypes.Failure,
      });

      client.destroy();
      reject(new Error(message));
    });

    client.on('connect', () => {
      isConnected = true;
      client.setEncoding('utf8');

      logger.log(LogEventId.SocketClientConnected, 'system', {
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
    logger.log(LogEventId.SocketClientConnected, 'system', {
      message: `Pollbook socket.io client connected to [${serverAddress.address}]:${serverAddress.port}`,
      disposition: LogDispositionStandardTypes.Success,
    });
    socket.on('disconnect', () => {
      logger.log(LogEventId.SocketClientDisconnected, 'system', {
        message: `Pollbook socket.io client disconnected from [${serverAddress.address}]:${serverAddress.port}`,
        disposition: LogDispositionStandardTypes.Success,
      });
    });
  });

  // Set up client for Unix socket managed by barcode scanner daemon
  const udsClient = await connectToBarcodeScannerSocket(logger);
  if (udsClient) {
    const barcodeScannerLines = lines(udsClient);
    // One scan results in a single line of serialized JSON
    for await (const line of barcodeScannerLines) {
      try {
        const result = safeParseJson(line, AamvaDocumentSchema);
        if (result.isErr()) {
          await logger.logAsCurrentRole(LogEventId.ParseError, {
            message: 'Could not parse barcode scan as AAMVA Document',
            error: result.err().message,
          });
        }

        const doc = result.ok();
        io.emit('barcode-scan', doc);
      } catch (e) {
        await logger.logAsCurrentRole(LogEventId.ParseError, {
          message: 'Could not read line from barcode scanner daemon UDS',
          error: (e as Error).message,
        });
      }
    }
  }
}
