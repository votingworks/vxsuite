import express from 'express';
import { Server } from 'node:http';
import {
  InsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
  JavaCard,
  MockFileCard,
} from '@votingworks/auth';
import { LogEventId, BaseLogger, Logger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import { detectUsbDrive } from '@votingworks/usb-drive';
import { initializeSystemAudio } from '@votingworks/backend';
import { detectPrinter, HP_LASER_PRINTER_CONFIG } from '@votingworks/printing';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { buildApp } from './app';
import { Workspace } from './util/workspace';
import { getUserRole } from './util/auth';

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
  const resolvedAuth =
    auth ??
    new InsertedSmartCardAuth({
      card:
        isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
        isIntegrationTest()
          ? new MockFileCard()
          : new JavaCard(),
      config: { allowCardlessVoterSessions: true },
      logger: baseLogger,
    });

  const logger = Logger.from(
    baseLogger,
    /* istanbul ignore next - @preserve */ () =>
      getUserRole(resolvedAuth, workspace)
  );
  const usbDrive = detectUsbDrive(logger);
  const printer = detectPrinter(logger);

  await initializeSystemAudio();

  const app = buildApp(resolvedAuth, logger, workspace, usbDrive, printer);

  useDevDockRouter(app, express, { printerConfig: HP_LASER_PRINTER_CONFIG });

  return app.listen(
    port,
    /* istanbul ignore next - @preserve */
    async () => {
      await logger.log(LogEventId.ApplicationStartup, 'system', {
        message: `VxMark backend running at http://localhost:${port}/`,
        disposition: 'success',
      });
    }
  );
}
