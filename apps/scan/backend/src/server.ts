import express from 'express';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, Logger } from '@votingworks/logging';
import { UsbDrive, detectUsbDrive } from '@votingworks/usb-drive';
import {
  detectDevices,
  setAudioVolume,
  setDefaultAudio,
} from '@votingworks/backend';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import * as customScanner from '@votingworks/custom-scanner';
import {
  createMockPdiScanner,
  createPdiScannerClient,
} from '@votingworks/pdi-scanner';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { buildApp } from './app';
import { NODE_ENV, PORT } from './globals';
import { Workspace } from './util/workspace';
import { Printer, getPrinter } from './printing/printer';
import * as customStateMachine from './scanners/custom/state_machine';
import * as pdiStateMachine from './scanners/pdi/state_machine';
import { Player as AudioPlayer } from './audio/player';
import { getAudioInfo } from './audio/info';

export interface StartOptions {
  auth: InsertedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  port?: number | string;
  usbDrive?: UsbDrive;
  printer?: Printer;
}

/**
 * Starts the server.
 */
export async function start({
  auth,
  workspace,
  logger,
  usbDrive,
  printer,
}: StartOptions): Promise<void> {
  detectDevices({ logger });
  const resolvedUsbDrive = usbDrive ?? detectUsbDrive(logger);
  const resolvedPrinter = printer ?? getPrinter(logger);

  const mockPdiScanner = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_MOCK_PDI_SCANNER
  )
    ? /* istanbul ignore next - @preserve */
      createMockPdiScanner()
    : undefined;

  const precinctScannerStateMachine = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_CUSTOM_SCANNER
  )
    ? customStateMachine.createPrecinctScannerStateMachine({
        createCustomClient: customScanner.openScanner,
        auth,
        workspace,
        logger,
        usbDrive: resolvedUsbDrive,
      })
    : pdiStateMachine.createPrecinctScannerStateMachine({
        scannerClient:
          /* istanbul ignore next - @preserve */
          mockPdiScanner?.client ?? createPdiScannerClient(),
        workspace,
        usbDrive: resolvedUsbDrive,
        auth,
        logger,
      });

  // Clear any cached data
  workspace.clearUploads();

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

  const audioPlayer = new AudioPlayer(NODE_ENV, logger, audioInfo.builtin.name);

  const app = buildApp({
    audioPlayer,
    auth,
    machine: precinctScannerStateMachine,
    workspace,
    usbDrive: resolvedUsbDrive,
    printer: resolvedPrinter,
    logger,
  });

  useDevDockRouter(app, express, {
    printerConfig: 'fujitsu',
    mockPdiScanner,
  });

  app.listen(PORT, () => {
    logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `VxScan backend running at http://localhost:${PORT}/`,
      disposition: 'success',
    });

    logger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
      message: `Scanning ballots into ${workspace.ballotImagesPath}`,
    });
  });
}
