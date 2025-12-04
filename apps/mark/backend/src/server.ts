import express from 'express';
import { Server } from 'node:http';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { LogEventId, BaseLogger, Logger } from '@votingworks/logging';
import { detectUsbDrive } from '@votingworks/usb-drive';
import { startCpuMetricsLogging } from '@votingworks/backend';
import { detectPrinter, HP_LASER_PRINTER_CONFIG } from '@votingworks/printing';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { buildApp } from './app';
import { Workspace } from './util/workspace';
import { getDefaultAuth, getUserRole } from './util/auth';
import { Client as BarcodeClient } from './barcodes';

export interface StartOptions {
  auth?: InsertedSmartCardAuthApi;
  baseLogger: BaseLogger;
  port: number | string;
  workspace: Workspace;
}

/**
 * Starts the server with all the default options.
 */
export function start({
  auth,
  baseLogger,
  port,
  workspace,
}: StartOptions): Server {
  /* istanbul ignore next - @preserve */
  const resolvedAuth = auth ?? getDefaultAuth(baseLogger);

  const logger = Logger.from(
    baseLogger,
    /* istanbul ignore next - @preserve */ () =>
      getUserRole(resolvedAuth, workspace)
  );
  const usbDrive = detectUsbDrive(logger);
  const printer = detectPrinter(logger);

  // Only create barcode client in production or when explicitly enabled via env variable
  const barcodeClient = new BarcodeClient(baseLogger);

  const app = buildApp({
    auth: resolvedAuth,
    barcodeClient,
    logger,
    workspace,
    usbDrive,
    printer,
  });

  useDevDockRouter(app, express, { printerConfig: HP_LASER_PRINTER_CONFIG });

  // Start periodic CPU metrics logging
  startCpuMetricsLogging(logger);

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
