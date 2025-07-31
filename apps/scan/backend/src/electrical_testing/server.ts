/* eslint @typescript-eslint/no-use-before-define: ["error", { "functions": false }] */

import { extractErrorMessage } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';

import { setAudioVolume, setDefaultAudio } from '@votingworks/backend';
import { NODE_ENV, PORT } from '../globals';
import { buildApp } from './app';
import { runPrintAndScanTask } from './tasks/print_and_scan_task';
import { ServerContext } from './context';
import { runCardReadAndUsbDriveWriteTask } from './tasks/card_read_and_usb_drive_write_task';
import { Player as AudioPlayer } from '../audio/player';
import { getAudioInfo } from '../audio/info';

export async function startElectricalTestingServer(
  context: ServerContext
): Promise<void> {
  const { logger } = context;
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
      context.setStatusMessage('scanner', 'Print and scan loop completed');
    })
    .catch((error) => {
      logger.log(LogEventId.BackgroundTaskFailure, 'system', {
        disposition: 'failure',
        message: 'Print and scan loop failed',
        error,
      });
      context.setStatusMessage(
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

  app.listen(PORT, () => {
    logger.log(LogEventId.ApplicationStartup, 'system', {
      disposition: 'success',
      message: `VxScan electrical testing backend running at http://localhost:${PORT}`,
    });
  });
}

async function configureAudio(logger: Logger): Promise<AudioPlayer> {
  const audioInfo = await getAudioInfo({
    baseRetryDelayMs: 2000,
    logger,
    maxAttempts: 4,
    nodeEnv: NODE_ENV,
  });

  if (audioInfo.usb) {
    const resultDefaultAudio = await setDefaultAudio(audioInfo.usb.name, {
      logger,
      nodeEnv: NODE_ENV,
    });
    resultDefaultAudio.assertOk('unable to set USB audio as default output');

    const resultVolume = await setAudioVolume({
      logger,
      nodeEnv: NODE_ENV,
      sinkName: audioInfo.usb.name,
      // This is set to 100% in the prod app, but the HWTA has no UI volume
      // control at the moment, so this is set to a safe listening level
      // discovered the hard way:
      volumePct: 40,
    });
    resultVolume.assertOk('unable to set USB audio volume');
  } else {
    void logger.logAsCurrentRole(LogEventId.AudioDeviceMissing, {
      message: 'USB audio device not detected.',
      disposition: 'failure',
    });
  }

  return new AudioPlayer(NODE_ENV, logger, audioInfo.builtin.name);
}
