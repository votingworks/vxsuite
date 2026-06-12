import express from 'express';
import { BaseLogger, Logger, LogEventId } from '@votingworks/logging';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import {
  getSimulatedUsbPlatform,
  detectUsbDrive,
} from '@votingworks/usb-drive';
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
  /* istanbul ignore next */
  const resolvedAuth = auth ?? getDefaultAuth(baseLogger);
  const logger = Logger.from(
    baseLogger,
    /* istanbul ignore next */ () => getUserRole(resolvedAuth, workspace)
  );
  const usbDrive = detectUsbDrive(logger, {
    platform: getSimulatedUsbPlatform(),
  });
  const printer = detectPrinter(logger);

  const context: AppContext = {
    auth: resolvedAuth,
    logger,
    usbDrive,
    workspace,
    printer,
  };

  const ballotPrintCount = workspace.store.getTotalBallotPrintCount();
  baseLogger.log(LogEventId.DataCheckOnStartup, 'system', {
    message:
      ballotPrintCount > 0
        ? 'Ballot print counts are present in the database on machine startup.'
        : 'No ballot print counts are present in the database on machine startup.',
    ballotPrintCount,
  });

  const app = buildApp(context);

  useDevDockRouter(app, express, { printerConfig: HP_LASER_PRINTER_CONFIG });

  startCpuMetricsLogging(baseLogger);

  app.listen(
    PORT,
    /* istanbul ignore next */
    () => {
      void baseLogger.log(LogEventId.ApplicationStartup, 'system', {
        message: `VxPrint backend running at http://localhost:${PORT}/`,
        disposition: 'success',
      });
    }
  );
}
