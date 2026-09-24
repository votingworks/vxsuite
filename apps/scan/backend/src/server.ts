import express from 'express';
import type { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, type Logger } from '@votingworks/logging';
import { type UsbDrive, detectUsbDriveFromEnv } from '@votingworks/usb-drive';
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
import type { FujitsuThermalPrinterInterface } from '@votingworks/fujitsu-thermal-printer';
import { buildApi, buildApp } from './app.js';
import { PORT } from './globals.js';
import type { Workspace } from './util/workspace.js';
import * as scanner from './scanner.js';
import { type AudioPlayerInterface, newAudioPlayer } from './audio/audio.js';

export interface StartOptions {
  auth: InsertedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  port?: number | string;
  usbDrive?: UsbDrive;
  printer: FujitsuThermalPrinterInterface;
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

  const systemSettings = workspace.store.getSystemSettings();
  const isScreenReaderEnabled = Boolean(
    systemSettings && !systemSettings.precinctScanDisableScreenReaderAudio
  );

  const resolvedAudioPlayer =
    audioPlayer ??
    (await newAudioPlayer({
      logger,
      screenReaderEnabled: isScreenReaderEnabled,
    }));

  const context: Parameters<typeof buildApi>[0] = {
    audioPlayer: resolvedAudioPlayer,
    auth,
    machine: precinctScannerStateMachine,
    workspace,
    usbDrive: resolvedUsbDrive,
    printer,
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
