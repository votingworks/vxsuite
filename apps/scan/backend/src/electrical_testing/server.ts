import { extractErrorMessage } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';

import { startCpuMetricsLogging } from '@votingworks/backend';
import { NODE_ENV, PORT } from '../globals';
import { buildApp } from './app';
import { runPrintAndScanTask } from './tasks/print_and_scan_task';
import { ServerContext } from './context';
import { runCardReadAndUsbDriveWriteTask } from './tasks/card_read_and_usb_drive_write_task';
import { Player as AudioPlayer } from '../audio/player';
import { AudioCard } from '../audio/card';

export async function startElectricalTestingServer(
  context: ServerContext
): Promise<void> {
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

  const audioPlayer = await configureAudio(logger).catch((error) => {
    logger.log(LogEventId.UnknownError, 'system', {
      disposition: 'failure',
      message: 'Audio configuration failed',
      error,
    });

    return undefined;
  });

  const app = buildApp({
    ...context,
    audioPlayer,
  });

  // Start periodic CPU metrics logging
  startCpuMetricsLogging(logger);

  app.listen(PORT, () => {
    logger.log(LogEventId.ApplicationStartup, 'system', {
      disposition: 'success',
      message: `VxScan electrical testing backend running at http://localhost:${PORT}`,
    });
  });
}

async function configureAudio(logger: Logger): Promise<AudioPlayer> {
  const audioCard = await AudioCard.default(NODE_ENV, logger);

  // System volume is set to 100% in the prod app, but the HWTA has no UI volume control, so we set
  // to a safe listening level discovered the hard way
  await audioCard.useHeadphones();
  await audioCard.setVolume(40);

  return new AudioPlayer(NODE_ENV, logger, audioCard);
}
