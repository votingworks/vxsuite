import express from 'express';
import { Server } from 'node:http';
import {
  InsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
  JavaCard,
  MockFileCard,
} from '@votingworks/auth';
import { LogEventId, BaseLogger, Logger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import { detectUsbDrive } from '@votingworks/usb-drive';
import { setAudioVolume, setDefaultAudio } from '@votingworks/backend';
import { detectPrinter, HP_LASER_PRINTER_CONFIG } from '@votingworks/printing';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { buildApp } from './app';
import { Workspace } from './util/workspace';
import { getUserRole } from './util/auth';
import * as barcodes from './barcodes';
import { getAudioInfo } from './audio/info';
import { NODE_ENV } from './globals';
import { Player as AudioPlayer } from './audio/player';

export interface StartOptions {
  auth?: InsertedSmartCardAuthApi;
  baseLogger: BaseLogger;
  port: number | string;
  workspace: Workspace;
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  auth,
  baseLogger,
  port,
  workspace,
}: StartOptions): Promise<Server> {
  /* istanbul ignore next - @preserve */
  const resolvedAuth =
    auth ??
    new InsertedSmartCardAuth({
      card:
        isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
        isIntegrationTest()
          ? new MockFileCard()
          : new JavaCard(),
      config: { allowCardlessVoterSessions: true },
      logger: baseLogger,
    });

  const logger = Logger.from(
    baseLogger,
    /* istanbul ignore next - @preserve */ () =>
      getUserRole(resolvedAuth, workspace)
  );
  const usbDrive = detectUsbDrive(logger);
  const printer = detectPrinter(logger);

  let audioPlayer: AudioPlayer | undefined;
  if (!isIntegrationTest()) {
    const audioInfo = await getAudioInfo({
      baseRetryDelayMs: 2000,
      logger,
      maxAttempts: 4,
      nodeEnv: NODE_ENV,
    });

    // istanbul ignore next - @preserve
    if (audioInfo.usb) {
      const resultDefaultAudio = await setDefaultAudio(audioInfo.usb.name, {
        logger,
        nodeEnv: NODE_ENV,
      });
      resultDefaultAudio.assertOk('unable to set USB audio as default output');

      // Screen reader volume levels are calibrated against a maximum system
      // volume setting:
      const resultVolume = await setAudioVolume({
        logger,
        nodeEnv: NODE_ENV,
        sinkName: audioInfo.usb.name,
        volumePct: 100,
      });
      resultVolume.assertOk('unable to set USB audio volume');
    } else {
      void logger.logAsCurrentRole(LogEventId.AudioDeviceMissing, {
        message: 'USB audio device not detected.',
        disposition: 'failure',
      });
    }

    audioPlayer = new AudioPlayer(NODE_ENV, logger, audioInfo.builtin.name);
  }

  const app = buildApp({
    audioPlayer,
    auth: resolvedAuth,
    barcodeClient: isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.MARK_ENABLE_BARCODE_DEMO
    )
      ? new barcodes.Client(logger)
      : undefined,
    logger,
    workspace,
    usbDrive,
    printer,
  });

  useDevDockRouter(app, express, { printerConfig: HP_LASER_PRINTER_CONFIG });

  return app.listen(
    port,
    /* istanbul ignore next - @preserve */
    () => {
      logger.log(LogEventId.ApplicationStartup, 'system', {
        message: `VxMark backend running at http://localhost:${port}/`,
        disposition: 'success',
      });
    }
  );
}
