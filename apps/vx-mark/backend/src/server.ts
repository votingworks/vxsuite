import { Logger, LogEventId, LogSource } from '@votingworks/logging';
import { Server } from 'http';
import { MARK_WORKSPACE, PORT } from './globals';
import { buildApp } from './app';
import { createWorkspace, Workspace } from './util/workspace';

export interface StartOptions {
  port: number | string;
  logger: Logger;
  workspace: Workspace;
}

/**
 * Starts the server with all the default options.
 */
export function start({
  port = PORT,
  logger = new Logger(LogSource.VxMarkBackend),
  workspace,
}: Partial<StartOptions> = {}): Server {
  let resolvedWorkspace: Workspace;

  if (workspace) {
    resolvedWorkspace = workspace;
  } else {
    const workspacePath = MARK_WORKSPACE;
    if (!workspacePath) {
      throw new Error('workspace path could not be determined');
    }
    resolvedWorkspace = createWorkspace(workspacePath);
  }
  const app = buildApp(resolvedWorkspace);

  return app.listen(
    port,
    /* istanbul ignore next */
    async () => {
      await logger.log(LogEventId.ApplicationStartup, 'system', {
        message: `VxMark backend running at http://localhost:${port}/`,
        disposition: 'success',
      });
    }
  );
}
