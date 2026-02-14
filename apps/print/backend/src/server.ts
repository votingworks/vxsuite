import express from 'express';
import { BaseLogger, Logger } from '@votingworks/logging';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import { detectUsbDrive } from '@votingworks/usb-drive';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { detectPrinter, HP_LASER_PRINTER_CONFIG } from '@votingworks/printing';
import { startCpuMetricsLogging } from '@votingworks/backend';
import { buildApp } from './app';
import { PORT } from './globals';
import { Workspace } from './util/workspace';
import { getDefaultAuth, getUserRole } from './util/auth';
import { AppContext } from './context';

export interface StartOptions {
  auth?: DippedSmartCardAuthApi;
  baseLogger: BaseLogger;
  workspace: Workspace;
}

/**
 * Starts the server.
 */
export function start({ auth, baseLogger, workspace }: StartOptions): void {
  /* istanbul ignore next - @preserve */
  const resolvedAuth = auth ?? getDefaultAuth(baseLogger);
  const logger = Logger.from(
    baseLogger,
    /* istanbul ignore next - @preserve */ () =>
      getUserRole(resolvedAuth, workspace)
  );
  const usbDrive = detectUsbDrive(logger);
  const printer = detectPrinter(logger);

  const context: AppContext = {
    auth: resolvedAuth,
    logger,
    usbDrive,
    workspace,
    printer,
  };
  const app = buildApp(context);

  useDevDockRouter(app, express, { printerConfig: HP_LASER_PRINTER_CONFIG });

  startCpuMetricsLogging(baseLogger);

  app.listen(
    PORT,
    /* istanbul ignore next - @preserve */
    () => {
      // eslint-disable-next-line no-console
      console.log(`VxPrint backend running at http://localhost:${PORT}/`);
    }
  );
}
