import { LogEventId, Logger, LogSource } from '@votingworks/logging';

import { Application } from 'express';
import { DippedSmartCardAuth, MemoryCard } from '@votingworks/auth';
import { Server } from 'http';
import { ADMIN_WORKSPACE, PORT } from './globals';
import { createWorkspace, Workspace } from './util/workspace';
import { buildApp } from './app';

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

  /* istanbul ignore next */
  const resolvedApp =
    app ??
    buildApp({
      auth: new DippedSmartCardAuth({
        card: new MemoryCard({ baseUrl: 'http://localhost:3001' }),
        config: {
          allowElectionManagersToAccessUnconfiguredMachines: false,
        },
        logger,
      }),
      workspace: resolvedWorkspace,
      logger,
    });

  const server = resolvedApp.listen(port, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Admin Service running at http://localhost:${port}/`,
      disposition: 'success',
    });
  });
  return server;
}
