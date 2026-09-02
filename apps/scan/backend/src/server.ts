import express from 'express';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, Logger } from '@votingworks/logging';
import { UsbDrive, detectUsbDriveFromEnv } from '@votingworks/usb-drive';
import {
  detectDevices,
  getNodeEnv,
  startCpuMetricsLogging,
} from '@votingworks/backend';
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
import { buildApi, buildApp } from './app.js';
import { PORT } from './globals.js';
import { Workspace } from './util/workspace.js';
import * as scanner from './scanner.js';
import {
  Player as AudioPlayer,
  PlayerInterface as AudioPlayerInterface,
} from './audio/player.js';
import { AudioCard } from './audio/card.js';

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
  const stopDetectingDevices = detectDevices({ logger });
  const resolvedUsbDrive = usbDrive ?? detectUsbDriveFromEnv({ logger });
  const resolvedPrinter = printer ?? getFujitsuThermalPrinter(logger);

  // TODO: We can likely consolidate on the file-based mock scanner in all
  // cases — the branching here isn't known to be required.
  // @coverage-exclude
  const mockPdiScanner = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_MOCK_PDI_SCANNER
  )
    ? isIntegrationTest()
      ? createMockFilePdiScanner()
      : createMockPdiScanner()
    : undefined;

  const precinctScannerStateMachine = scanner.createPrecinctScannerStateMachine(
    {
      scannerClient: mockPdiScanner?.client ?? createPdiScannerClient(),
      workspace,
      usbDrive: resolvedUsbDrive,
      auth,
      logger,
    }
  );

  // Clear any cached data
  workspace.clearUploads();

  const nodeEnv = getNodeEnv();
  const resolvedAudioPlayer =
    audioPlayer ??
    new AudioPlayer(nodeEnv, logger, await AudioCard.default(nodeEnv, logger));

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

  // @coverage-exclude: internal dev use only
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

  const server = app.listen(PORT, () => {
    logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `VxScan backend running at http://localhost:${PORT}/`,
      disposition: 'success',
    });

    logger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
      message: `Scanning ballots into ${workspace.ballotImagesPath}`,
    });
  });
  server.on('close', stopDetectingDevices);
}
