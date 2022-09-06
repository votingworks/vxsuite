import { Admin } from '@votingworks/api';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { Id, safeParse } from '@votingworks/types';
import express, { Application } from 'express';
import { ADMIN_WORKSPACE, PORT } from './globals';
import { Store } from './store';
import { createWorkspace, Workspace } from './util/workspace';

type NoParams = never;

/**
 * Builds an express application.
 */
export function buildApp({ store }: { store: Store }): Application {
  const app: Application = express();

  app.use(express.raw());
  app.use(express.json({ limit: '50mb', type: 'application/json' }));
  app.use(express.urlencoded({ extended: false }));

  app.get<NoParams>('/admin/elections', (_request, response) => {
    response.json(store.getElections());
  });

  app.post<NoParams, Admin.PostElectionResponse, Admin.PostElectionRequest>(
    '/admin/elections',
    (request, response) => {
      const parseResult = safeParse(
        Admin.PostElectionRequestSchema,
        request.body
      );

      if (parseResult.isErr()) {
        response.status(400).json({
          status: 'error',
          errors: [
            { type: 'ValidationError', message: parseResult.err().message },
          ],
        });
        return;
      }

      const electionDefinition = parseResult.ok();
      const electionId = store.addElection(electionDefinition.electionData);
      response.json({ status: 'ok', id: electionId });
    }
  );

  app.delete<{ electionId: Id }>(
    '/admin/elections/:electionId',
    (request, response) => {
      store.deleteElection(request.params.electionId);
      response.json({ status: 'ok' });
    }
  );

  return app;
}

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
}: Partial<StartOptions>): Promise<void> {
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

  /* istanbul ignore next */
  const resolvedApp = app ?? buildApp({ store: resolvedWorkspace.store });

  resolvedApp.listen(port, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Admin Service running at http://localhost:${port}/`,
      disposition: 'success',
    });
  });
}
