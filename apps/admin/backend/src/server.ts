import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { Application } from 'express';
import {
  DippedSmartCardAuth,
  JavaCard,
  constructJavaCardConfig,
  MockFileCard,
} from '@votingworks/auth';
import { getUsbDrives } from '@votingworks/backend';
import { Server } from 'http';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import { ADMIN_WORKSPACE, PORT } from './globals';
import { createWorkspace, Workspace } from './util/workspace';
import { buildApp } from './app';
import { Usb } from './util/usb';

/**
 * Options for starting the admin service.
 */
export interface StartOptions {
  app: Application;
  logger: Logger;
  port: number | string;
  workspace: Workspace;
}

/**
 * Starts the server with all the default options.
 */
export async function start({
  app,
  logger = new Logger(LogSource.VxAdminService),
  port = PORT,
  workspace,
}: Partial<StartOptions>): Promise<Server> {
  let resolvedWorkspace = workspace;
  /* istanbul ignore next */
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

  // Clear any cached data
  resolvedWorkspace.clearUploads();

  let resolvedApp = app;
  /* istanbul ignore next */
  if (!resolvedApp) {
    const auth = new DippedSmartCardAuth({
      card:
        isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
        isIntegrationTest()
          ? new MockFileCard()
          : new JavaCard(
              constructJavaCardConfig({ includeCardProgrammingConfig: true })
            ),
      config: {
        allowElectionManagersToAccessUnconfiguredMachines: false,
      },
      logger,
    });

    const usb: Usb = { getUsbDrives };

    resolvedApp = buildApp({
      auth,
      logger,
      usb,
      workspace: resolvedWorkspace,
    });
  }

  const server = resolvedApp.listen(port, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Admin Service running at http://localhost:${port}/`,
      disposition: 'success',
    });
  });
  return server;
}
