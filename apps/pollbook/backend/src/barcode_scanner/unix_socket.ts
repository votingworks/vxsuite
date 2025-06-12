import {
  LogDispositionStandardTypes,
  LogEventId,
  Logger,
} from '@votingworks/logging';
import * as net from 'node:net';

const UDS_PATH = '/tmp/barcodescannerd.sock';

/*
 * Attempts to connect to the barcode scanner Unix socket once. Resolves with
 * the socket client if successful or rejects with an error.
 */
export function tryConnect(logger: Logger): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection({
      path: UDS_PATH,
    });

    client.once('connect', () => {
      client.setEncoding('utf8');

      client.on('error', (err) => {
        logger.log(LogEventId.SocketClientError, 'system', {
          message: 'Pollbook UDS client received an error',
          error: err.message,
          disposition: LogDispositionStandardTypes.Failure,
        });
      });

      logger.log(LogEventId.SocketClientConnected, 'system', {
        message: 'Pollbook backend connected to barcode scanner Unix socket',
        disposition: LogDispositionStandardTypes.Success,
      });

      resolve(client);
    });

    client.once('error', (err) => {
      const message = `Pollbook backend failed to connect to barcode scanner Unix socket: ${err.message}`;
      logger.log(LogEventId.SocketClientConnected, 'system', {
        message,
        disposition: LogDispositionStandardTypes.Failure,
      });

      client.destroy();
      reject(new Error(message));
    });
  });
}
