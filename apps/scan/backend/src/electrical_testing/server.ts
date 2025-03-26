import { extractErrorMessage } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';

import { PORT } from '../globals';
import { buildApp } from './app';
import { printAndScanLoop } from './loops/print_and_scan_loop';
import { ServerContext } from './context';
import { runCardReadAndUsbDriveWriteLoop } from './loops/card_read_and_usb_drive_write_loop';

export function startElectricalTestingServer(context: ServerContext): void {
  const { workspace, logger } = context;
  const cardReadAndUsbDriveWriteLoopPromise =
    runCardReadAndUsbDriveWriteLoop(context);
  const printAndScanLoopPromise = printAndScanLoop(context);

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
      workspace.store.setElectricalTestingStatusMessage(
        'scanner',
        'Print and scan loop completed'
      );
    })
    .catch((error) => {
      void logger.log(LogEventId.BackgroundTaskFailure, 'system', {
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

  app.listen(PORT, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      disposition: 'success',
      message: `VxScan electrical testing backend running at http://localhost:${PORT}`,
    });
  });
}
