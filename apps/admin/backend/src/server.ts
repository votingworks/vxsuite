import {
  LogEventId,
  BaseLogger,
  LogSource,
  Logger,
} from '@votingworks/logging';
import { Application } from 'express';
import { DippedSmartCardAuth, JavaCard, MockFileCard } from '@votingworks/auth';
import { Server } from 'http';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import { detectUsbDrive, UsbDrive } from '@votingworks/usb-drive';
import { Printer, detectPrinter } from '@votingworks/printing';
import { detectDevices } from '@votingworks/backend';
import { ADMIN_WORKSPACE, PORT } from './globals';
import { createWorkspace, Workspace } from './util/workspace';
import { buildApp } from './app';
import { rootDebug } from './util/debug';
import { getUserRole } from './util/auth';

const debug = rootDebug.extend('server');

/**
 * Options for starting the admin service.
 */
export interface StartOptions {
  app: Application;
  logger: BaseLogger;
  port: number | string;
  workspace: Workspace;
  usbDrive?: UsbDrive;
  printer?: Printer;
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  app,
  logger: baseLogger = new BaseLogger(LogSource.VxAdminService),
  port = PORT,
  workspace,
  usbDrive,
  printer,
}: Partial<StartOptions>): Promise<Server> {
  debug('starting server...');
  detectDevices({ logger: baseLogger });
  let resolvedWorkspace = workspace;
  /* c8 ignore start */
  if (!resolvedWorkspace) {
    const workspacePath = ADMIN_WORKSPACE;
    if (!workspacePath) {
      await baseLogger.log(
        LogEventId.AdminServiceConfigurationMessage,
        'system',
        {
          message:
            'workspace path could not be determined; pass a workspace or run with ADMIN_WORKSPACE',
          disposition: 'failure',
        }
      );
      throw new Error(
        'workspace path could not be determined; pass a workspace or run with ADMIN_WORKSPACE'
      );
    }
    resolvedWorkspace = createWorkspace(workspacePath);
  }
  /* c8 ignore stop */

  let resolvedApp = app;

  /* c8 ignore start */
  if (!resolvedApp) {
    const auth = new DippedSmartCardAuth({
      card:
        isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
        isIntegrationTest()
          ? new MockFileCard()
          : new JavaCard(),
      config: {
        allowElectionManagersToAccessUnconfiguredMachines: false,
      },
      logger: baseLogger,
    });

    const logger = Logger.from(baseLogger, () =>
      getUserRole(auth, resolvedWorkspace)
    );

    const resolvedUsbDrive = usbDrive ?? detectUsbDrive(logger);
    const resolvedPrinter = printer ?? detectPrinter(logger);

    resolvedApp = buildApp({
      auth,
      logger,
      usbDrive: resolvedUsbDrive,
      printer: resolvedPrinter,
      workspace: resolvedWorkspace,
    });
  }
  /* c8 ignore stop */

  const server = resolvedApp.listen(port, async () => {
    await baseLogger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Admin Service running at http://localhost:${port}/`,
      disposition: 'success',
    });
  });
  return server;
}
