import express from 'express';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, Logger } from '@votingworks/logging';
import { UsbDrive, detectUsbDriveFromEnv } from '@votingworks/usb-drive';
import { detectDevices, startCpuMetricsLogging } from '@votingworks/backend';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import {
  createMockFilePdiScanner,
  createMockPdiScanner,
  createPdiScannerClient,
} from '@votingworks/pdi-scanner';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import {
  FujitsuThermalPrinterInterface,
  getFujitsuThermalPrinter,
} from '@votingworks/fujitsu-thermal-printer';
import { buildApi, buildApp } from './app';
import { NODE_ENV, PORT } from './globals';
import { Workspace } from './util/workspace';
import * as scanner from './scanner';
import {
  Player as AudioPlayer,
  PlayerInterface as AudioPlayerInterface,
} from './audio/player';
import { AudioCard } from './audio/card';

export interface StartOptions {
  auth: InsertedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  port?: number | string;
  usbDrive?: UsbDrive;
  printer?: FujitsuThermalPrinterInterface;
  audioPlayer?: AudioPlayerInterface;
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
  audioPlayer,
}: StartOptions): Promise<void> {
  detectDevices({ logger });
  const resolvedUsbDrive = usbDrive ?? detectUsbDriveFromEnv({ logger });
  const resolvedPrinter = printer ?? getFujitsuThermalPrinter(logger);

  // TODO: We can likely consolidate on the file-based mock scanner in all
  // cases — the branching here isn't known to be required.
  /* istanbul ignore next */
  const mockPdiScanner = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_MOCK_PDI_SCANNER
  )
    ? isIntegrationTest()
      ? createMockFilePdiScanner()
      : createMockPdiScanner()
    : undefined;

  const precinctScannerStateMachine = scanner.createPrecinctScannerStateMachine(
    {
      scannerClient:
        /* istanbul ignore next */
        mockPdiScanner?.client ?? createPdiScannerClient(),
      workspace,
      usbDrive: resolvedUsbDrive,
      auth,
      logger,
    }
  );

  // Clear any cached data
  workspace.clearUploads();

  /* istanbul ignore next */
  const resolvedAudioPlayer =
    audioPlayer ??
    new AudioPlayer(
      NODE_ENV,
      logger,
      await AudioCard.default(NODE_ENV, logger)
    );

  const systemSettings = workspace.store.getSystemSettings();
  const isScreenReaderEnabled = Boolean(
    systemSettings && !systemSettings.precinctScanDisableScreenReaderAudio
  );
  await resolvedAudioPlayer.setIsScreenReaderEnabled(isScreenReaderEnabled);

  const context: Parameters<typeof buildApi>[0] = {
    audioPlayer: resolvedAudioPlayer,
    auth,
    machine: precinctScannerStateMachine,
    workspace,
    usbDrive: resolvedUsbDrive,
    printer: resolvedPrinter,
    logger,
  };
  const api = buildApi(context);
  const app = buildApp(context, api);

  useDevDockRouter(app, express, {
    quickConfigure: {
      unconfigure: () => api.methods().unconfigureElection(),
      configure: async () => {
        (
          await api.methods().configureFromElectionPackageOnUsbDrive()
        ).unsafeUnwrap();
      },
    },
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
