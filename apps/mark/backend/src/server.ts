import express from 'express';
import { Server } from 'node:http';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, BaseLogger, Logger } from '@votingworks/logging';
import { detectUsbDrive } from '@votingworks/usb-drive';
import { startCpuMetricsLogging } from '@votingworks/backend';
import { detectPrinter, HP_LASER_PRINTER_CONFIG } from '@votingworks/printing';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { buildApp } from './app';
import { Workspace } from './util/workspace';
import { getDefaultAuth, getUserRole } from './util/auth';
import { BarcodeClient } from './barcodes';
import { MockBarcodeClient } from './barcodes/mock_client';
import {
  getMockPatInputConnected,
  setMockPatInputConnected,
} from './util/mock_pat_input';
import { NODE_ENV } from './globals';
import { Player as AudioPlayer } from './audio/player';
import {
  getMockAccessibleControllerConnected,
  setMockAccessibleControllerConnected,
} from './util/mock_accessible_controller';
import { initializeAudio } from './audio/initialize';

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
  const resolvedAuth = auth ?? getDefaultAuth(baseLogger).auth;

  const logger = Logger.from(
    baseLogger,
    /* istanbul ignore next - @preserve */ () =>
      getUserRole(resolvedAuth, workspace)
  );
  const usbDrive = detectUsbDrive(logger);
  const printer = detectPrinter(logger);

  // Skip creating real barcode client when mock barcode is enabled
  const useMockBarcode = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.USE_MOCK_BARCODE_READER
  );
  /* istanbul ignore next - @preserve */
  const barcodeClient = useMockBarcode
    ? new MockBarcodeClient()
    : new BarcodeClient(baseLogger);

  const audioInfo = await initializeAudio(logger);
  const audioPlayer = new AudioPlayer(NODE_ENV, logger, audioInfo.builtin.name);

  const app = buildApp({
    audioPlayer,
    auth: resolvedAuth,
    barcodeClient,
    logger,
    workspace,
    usbDrive,
    printer,
  });

  /* istanbul ignore next - @preserve  internal dev use only */
  useDevDockRouter(app, express, {
    printerConfig: HP_LASER_PRINTER_CONFIG,
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
  });

  // Start periodic CPU metrics logging
  startCpuMetricsLogging(logger);

  const server = app.listen(
    port,
    /* istanbul ignore next - @preserve */
    () => {
      logger.log(LogEventId.ApplicationStartup, 'system', {
        message: `VxMark backend running at http://localhost:${port}/`,
        disposition: 'success',
      });

      if (NODE_ENV === 'production') {
        // Play startup chime after a slight delay to allow kiosk-browser to
        // spin up first:
        setTimeout(() => void audioPlayer?.play('chime'), 2 * 1000);
      }
    }
  );

  return server;
}
