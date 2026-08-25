import express from 'express';
import { Server } from 'node:http';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, BaseLogger, Logger } from '@votingworks/logging';
import { detectUsbDriveFromEnv } from '@votingworks/usb-drive';
import { getNodeEnv, startCpuMetricsLogging } from '@votingworks/backend';
import { detectPrinter, HP_4001_PRINTER_CONFIG } from '@votingworks/printing';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { buildApp, buildApi, Context } from './app.js';
import { Workspace } from './util/workspace.js';
import { getDefaultAuth, getUserRole } from './util/auth.js';
import { BarcodeClient } from './barcodes/index.js';
import { MockBarcodeClient } from './barcodes/mock_client.js';
import {
  getMockPatInputConnected,
  setMockPatInputConnected,
} from './util/mock_pat_input.js';
import { Player as AudioPlayer } from './audio/player.js';
import {
  getMockAccessibleControllerConnected,
  setMockAccessibleControllerConnected,
} from './util/mock_accessible_controller.js';
import { initializeAudio } from './audio/initialize.js';

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
  /* istanbul ignore next */
  const resolvedAuth = auth ?? getDefaultAuth(baseLogger).auth;

  const logger = Logger.from(
    baseLogger,
    /* istanbul ignore next */ () => getUserRole(resolvedAuth, workspace)
  );
  const usbDrive = detectUsbDriveFromEnv({ logger });
  const printer = detectPrinter(logger);

  // Skip creating real barcode client when mock barcode is enabled
  const useMockBarcode = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_MOCK_BARCODE_READER
  );
  /* istanbul ignore next */
  const barcodeClient = useMockBarcode
    ? new MockBarcodeClient()
    : new BarcodeClient(baseLogger);

  const audioInfo = await initializeAudio(logger);
  const audioPlayer = new AudioPlayer(
    getNodeEnv(),
    logger,
    audioInfo.builtin.name
  );

  const context: Context = {
    audioPlayer,
    auth: resolvedAuth,
    barcodeClient,
    logger,
    workspace,
    usbDrive,
    printer,
  };
  const api = buildApi(context);
  const app = buildApp(context, api);

  /* istanbul ignore next - internal dev use only */
  useDevDockRouter(app, express, {
    printerConfig: HP_4001_PRINTER_CONFIG,
    getBarcodeConnected: () => Boolean(barcodeClient?.getConnectionStatus?.()),
    setBarcodeConnected: (connected: boolean) => {
      if (barcodeClient instanceof MockBarcodeClient) {
        barcodeClient.setConnected(connected);
      }
    },
    getAccessibleControllerConnected: () =>
      getMockAccessibleControllerConnected(),
    setAccessibleControllerConnected: (connected: boolean) =>
      setMockAccessibleControllerConnected(connected),
    getPatInputConnected: () => getMockPatInputConnected(),
    setPatInputConnected: (connected: boolean) =>
      setMockPatInputConnected(connected),
    quickConfigure: {
      unconfigure: () => api.methods().unconfigureMachine(),
      configure: async () => {
        (await api.methods().configureElectionPackageFromUsb()).unsafeUnwrap();
      },
    },
  });

  // Start periodic CPU metrics logging
  startCpuMetricsLogging(logger);

  const server = app.listen(
    port,
    /* istanbul ignore next */
    () => {
      logger.log(LogEventId.ApplicationStartup, 'system', {
        message: `VxMark backend running at http://localhost:${port}/`,
        disposition: 'success',
      });

      if (getNodeEnv() === 'production') {
        // Play startup chime after a slight delay to allow kiosk-browser to
        // spin up first:
        setTimeout(() => void audioPlayer?.play('chime'), 2 * 1000);
      }
    }
  );

  return server;
}
