import express from 'express';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, Logger } from '@votingworks/logging';
import { UsbDrive, detectUsbDrive } from '@votingworks/usb-drive';
import { detectDevices, startCpuMetricsLogging } from '@votingworks/backend';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import {
  createMockPdiScanner,
  createPdiScannerClient,
} from '@votingworks/pdi-scanner';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import {
  FujitsuThermalPrinterInterface,
  getFujitsuThermalPrinter,
} from '@votingworks/fujitsu-thermal-printer';
import { buildApp } from './app';
import { NODE_ENV, PORT } from './globals';
import { Workspace } from './util/workspace';
import * as scanner from './scanner';
import { Player as AudioPlayer } from './audio/player';
import { AudioCard } from './audio/card';

export interface StartOptions {
  auth: InsertedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  port?: number | string;
  usbDrive?: UsbDrive;
  printer?: FujitsuThermalPrinterInterface;
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
  const resolvedPrinter = printer ?? getFujitsuThermalPrinter(logger);

  const mockPdiScanner = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_MOCK_PDI_SCANNER
  )
    ? /* istanbul ignore next - @preserve */
      createMockPdiScanner()
    : undefined;

  const precinctScannerStateMachine = scanner.createPrecinctScannerStateMachine(
    {
      scannerClient:
        /* istanbul ignore next - @preserve */
        mockPdiScanner?.client ?? createPdiScannerClient(),
      workspace,
      usbDrive: resolvedUsbDrive,
      auth,
      logger,
    }
  );

  // Clear any cached data
  workspace.clearUploads();

  const audioCard = await AudioCard.default(NODE_ENV, logger);
  const audioPlayer = new AudioPlayer(NODE_ENV, logger, audioCard);

  const systemSettings = workspace.store.getSystemSettings();
  const isScreenReaderEnabled = Boolean(
    systemSettings && !systemSettings.precinctScanDisableScreenReaderAudio
  );
  await audioPlayer.setIsScreenReaderEnabled(isScreenReaderEnabled);

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

  // Start periodic CPU metrics logging
  startCpuMetricsLogging(logger);

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
