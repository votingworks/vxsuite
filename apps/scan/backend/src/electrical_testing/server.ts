import { LogEventId } from '@votingworks/logging';

import { PORT } from '../globals';
import { buildApp } from './app';
import { cardReadAndUsbDriveWriteLoop, printAndScanLoop } from './background';
import { ServerContext } from './context';
import {
  createSimpleScannerClient,
  SimpleScannerClient,
} from './simple_scanner_client';

export interface ElectricalTestingServerContext extends ServerContext {
  scannerClient: SimpleScannerClient;
  controller: AbortController;
}

export function startElectricalTestingServer(context: ServerContext): void {
  const { logger } = context;
  const controller = new AbortController();
  const client = createSimpleScannerClient();
  const testContext: ElectricalTestingServerContext = {
    ...context,
    scannerClient: client,
    controller,
  };
  const cardReadAndUsbDriveWriteLoopPromise =
    cardReadAndUsbDriveWriteLoop(testContext);
  const printAndScanLoopPromise = printAndScanLoop(testContext);

  void logger.log(LogEventId.BackgroundTaskStarted, 'system', {
    disposition: 'success',
    message: 'Starting card read loop',
  });

  void logger.log(LogEventId.BackgroundTaskStarted, 'system', {
    disposition: 'success',
    message: 'Starting print and scan loop',
  });

  cardReadAndUsbDriveWriteLoopPromise
    .then(() => {
      void logger.log(LogEventId.BackgroundTaskCompleted, 'system', {
        disposition: 'success',
        message: 'Card read and USB drive write loop completed',
      });
    })
    .catch((error) => {
      void logger.log(LogEventId.BackgroundTaskFailure, 'system', {
        disposition: 'failure',
        message: 'Card read and USB drive write loop failed',
        error,
      });
    });

  printAndScanLoopPromise
    .then(() => {
      void logger.log(LogEventId.BackgroundTaskCompleted, 'system', {
        disposition: 'success',
        message: 'Print and scan loop completed',
      });
    })
    .catch((error) => {
      void logger.log(LogEventId.BackgroundTaskFailure, 'system', {
        disposition: 'failure',
        message: 'Print and scan loop failed',
        error,
      });
    });

  const app = buildApp(testContext);

  app.listen(PORT, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      disposition: 'success',
      message: `VxScan electrical testing backend running at http://localhost:${PORT}`,
    });
  });
}
