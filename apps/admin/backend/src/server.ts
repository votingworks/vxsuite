import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { Application } from 'express';
import { DippedSmartCardAuth, JavaCard, MockFileCard } from '@votingworks/auth';
import { Server } from 'http';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import { detectUsbDrive, UsbDrive } from '@votingworks/usb-drive';
import { ADMIN_WORKSPACE, PORT } from './globals';
import { createWorkspace, Workspace } from './util/workspace';
import { buildApp } from './app';
import { rootDebug } from './util/debug';
import { RealTallyCache } from './tabulation/tally_cache';

const debug = rootDebug.extend('server');

/**
 * Options for starting the admin service.
 */
export interface StartOptions {
  app: Application;
  logger: Logger;
  port: number | string;
  workspace: Workspace;
  usbDrive?: UsbDrive;
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  app,
  logger = new Logger(LogSource.VxAdminService),
  port = PORT,
  workspace,
  usbDrive,
}: Partial<StartOptions>): Promise<Server> {
  debug('starting server...');
  let resolvedWorkspace = workspace;
  /* c8 ignore start */
  if (!resolvedWorkspace) {
    const workspacePath = ADMIN_WORKSPACE;
    if (!workspacePath) {
      await logger.log(LogEventId.AdminServiceConfigurationMessage, 'system', {
        message:
          'workspace path could not be determined; pass a workspace or run with ADMIN_WORKSPACE',
        disposition: 'failure',
      });
      throw new Error(
        'workspace path could not be determined; pass a workspace or run with ADMIN_WORKSPACE'
      );
    }
    resolvedWorkspace = createWorkspace(workspacePath);
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  const resolvedUsbDrive = usbDrive ?? detectUsbDrive(logger);
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
      logger,
    });

    resolvedApp = buildApp({
      auth,
      logger,
      usbDrive: resolvedUsbDrive,
      workspace: resolvedWorkspace,
      tallyCache: new RealTallyCache(),
    });
  }
  /* c8 ignore stop */

  const server = resolvedApp.listen(port, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Admin Service running at http://localhost:${port}/`,
      disposition: 'success',
    });
  });
  return server;
}
