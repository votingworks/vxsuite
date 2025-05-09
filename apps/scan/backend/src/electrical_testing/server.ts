import { extractErrorMessage } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';

import { PORT } from '../globals';
import { buildApp } from './app';
import { runPrintAndScanTask } from './tasks/print_and_scan_task';
import { ServerContext } from './context';
import { runCardReadAndUsbDriveWriteTask } from './tasks/card_read_and_usb_drive_write_task';

export function startElectricalTestingServer(context: ServerContext): void {
  const { workspace, logger } = context;
  const cardReadAndUsbDriveWriteLoopPromise =
    runCardReadAndUsbDriveWriteTask(context);
  const printAndScanLoopPromise = runPrintAndScanTask(context);

  logger.log(LogEventId.BackgroundTaskStarted, 'system', {
    disposition: 'success',
    message: 'Starting card read loop',
  });

  logger.log(LogEventId.BackgroundTaskStarted, 'system', {
    disposition: 'success',
    message: 'Starting print and scan loop',
  });

  cardReadAndUsbDriveWriteLoopPromise
    .then(() => {
      logger.log(LogEventId.BackgroundTaskCompleted, 'system', {
        disposition: 'success',
        message: 'Card read and USB drive write loop completed',
      });
    })
    .catch((error) => {
      logger.log(LogEventId.BackgroundTaskFailure, 'system', {
        disposition: 'failure',
        message: 'Card read and USB drive write loop failed',
        error,
      });
    });

  printAndScanLoopPromise
    .then(() => {
      logger.log(LogEventId.BackgroundTaskCompleted, 'system', {
        disposition: 'success',
        message: 'Print and scan loop completed',
      });
      workspace.store.setElectricalTestingStatusMessage(
        'scanner',
        'Print and scan loop completed'
      );
    })
    .catch((error) => {
      logger.log(LogEventId.BackgroundTaskFailure, 'system', {
        disposition: 'failure',
        message: 'Print and scan loop failed',
        error,
      });
      workspace.store.setElectricalTestingStatusMessage(
        'scanner',
        `Print and scan loop failed: ${extractErrorMessage(error)}`
      );
    });

  const app = buildApp(context);

  app.listen(PORT, () => {
    logger.log(LogEventId.ApplicationStartup, 'system', {
      disposition: 'success',
      message: `VxScan electrical testing backend running at http://localhost:${PORT}`,
    });
  });
}
