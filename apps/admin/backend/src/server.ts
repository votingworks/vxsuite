import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { Application } from 'express';
import {
  DippedSmartCardAuth,
  MemoryCard,
  JavaCard,
  constructDevJavaCardConfig,
} from '@votingworks/auth';
import { getUsbDrives } from '@votingworks/backend';
import { Server } from 'http';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
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
  const auth = new DippedSmartCardAuth({
    card: isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_JAVA_CARDS)
      ? /* istanbul ignore next */
        new JavaCard(
          constructDevJavaCardConfig({
            includeCardProgrammingConfig: true,
            pathToAuthLibRoot: '../../../libs/auth',
          })
        )
      : new MemoryCard({ baseUrl: 'http://localhost:3001' }),
    config: {
      allowElectionManagersToAccessUnconfiguredMachines: false,
    },
    logger,
  });

  let resolvedWorkspace = workspace;

  if (workspace) {
    resolvedWorkspace = workspace;
  } else {
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
    /* istanbul ignore next */
    resolvedWorkspace = createWorkspace(workspacePath);
  }

  // clear any cached data
  resolvedWorkspace.clearUploads();

  const usb: Usb = { getUsbDrives };

  /* istanbul ignore next */
  const resolvedApp =
    app ??
    buildApp({
      auth,
      workspace: resolvedWorkspace,
      logger,
      usb,
    });

  const server = resolvedApp.listen(port, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Admin Service running at http://localhost:${port}/`,
      disposition: 'success',
    });
  });
  return server;
}
