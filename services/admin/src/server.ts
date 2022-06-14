import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { safeParse } from '@votingworks/types';
import { Admin } from '@votingworks/api';
import express, { Application } from 'express';
import { Store } from './store';
import { createWorkspace, Workspace } from './util/workspace';
import { ADMIN_WORKSPACE, PORT } from './globals';

type NoParams = never;

/**
 * Builds an express application.
 */
export function buildApp({ store }: { store: Store }): Application {
  // Here to satisfy linter temporarily
  store.getDbPath();
  const app: Application = express();

  app.use(express.raw());
  app.use(express.json({ limit: '5mb', type: 'application/json' }));
  app.use(express.urlencoded({ extended: false }));

  app.post<
    NoParams,
    Admin.PostAdjudicationResponse,
    Admin.PostAdjudicationRequest
  >('/admin/write-ins/adjudication', (request, response) => {
    const bodyParseResult = safeParse(
      Admin.PostAdjudicationRequestSchema,
      request.body
    );

    if (bodyParseResult.isErr()) {
      const error = bodyParseResult.err();
      response.status(400).json({
        status: 'error',
        errors: [{ type: error.name, message: error.message }],
      });
      return;
    }

    const id = store.addAdjudication(bodyParseResult.ok().contestId);
    response.json({ id, status: 'ok' });
  });

  app.patch<
    NoParams,
    Admin.PatchAdjudicationTranscribedValueResponse,
    Admin.PatchAdjudicationTranscribedValueRequest
  >(
    '/admin/write-ins/adjudications/:adjudicationId/transcription',
    (request, response) => {
      const { adjudicationId } = request.params;

      if (typeof adjudicationId !== 'string') {
        response.status(404);
        return;
      }

      const bodyParseResult = safeParse(
        Admin.PatchAdjudicationTranscribedValueRequestSchema,
        request.body
      );

      if (bodyParseResult.isErr()) {
        const error = bodyParseResult.err();
        response.status(400).json({
          status: 'error',
          errors: [{ type: error.name, message: error.message }],
        });
        return;
      }

      const { transcribedValue } = bodyParseResult.ok();
      store.updateAdjudicationTranscribedValue(
        adjudicationId,
        transcribedValue
      );
      response.json({ status: 'ok' });
    }
  );

  app.get<NoParams>(
    '/admin/write-ins/adjudications/:contestId/id',
    (request, response) => {
      const { contestId } = request.params;

      if (typeof contestId !== 'string') {
        response.status(404);
        return;
      }
      response.json(store.getAdjudicationIdsByContestId(contestId));
    }
  );

  app.get<NoParams>(
    '/admin/write-ins/adjudications/contestId/count',
    (_, response) => {
      response.json(store.getAdjudicationCountsGroupedByContestId());
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
