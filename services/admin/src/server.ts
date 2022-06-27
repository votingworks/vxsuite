import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { ContestOptionId, safeParse } from '@votingworks/types';
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

  app.get<NoParams>('/admin/write-ins/cvrs/reset', (_, response) => {
    store.deleteCvrs();
    response.status(200).json({ status: 'ok' });
  });

  app.post<NoParams, Admin.PostCvrsResponse, Admin.PostCvrsRequest>(
    '/admin/write-ins/cvrs',
    (request, response) => {
      const bodyParseResult = safeParse(
        Admin.PostCvrsRequestSchema,
        request.body
      );

      /* TODO: this does not properly handle missing files on request body,
       * need to figure out how to define schema for Dictionary type.
       */
      /* istanbul ignore if */
      if (bodyParseResult.isErr()) {
        const error = bodyParseResult.err();
        response.status(400).json({
          status: 'error',
          errors: [{ type: error.name, message: error.message }],
        });
        return;
      }

      const { files } = bodyParseResult.ok();
      for (const f of files) {
        for (const cvr of f.allCastVoteRecords) {
          const cvrId = store.addCvr(JSON.stringify(cvr));
          for (const [key, value] of Object.entries(cvr)) {
            if (Array.isArray(value)) {
              const contestId = key;
              const votes = value as ContestOptionId[];
              for (const vote of votes) {
                if (vote.startsWith('write-in')) {
                  store.addAdjudication(contestId, cvrId);
                }
              }
            }
          }
        }
      }
      response.json({ status: 'ok' });
    }
  );

  app.patch<
    NoParams,
    Admin.PatchAdjudicationTranscribedValueResponse,
    Admin.PatchAdjudicationTranscribedValueRequest
  >(
    '/admin/write-ins/adjudications/:adjudicationId/transcription',
    (request, response) => {
      const { adjudicationId } = request.params;

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
    '/admin/write-ins/adjudications/contestId/count',
    (_, response) => {
      response.json(store.getAdjudicationCountsGroupedByContestId());
    }
  );

  app.get<NoParams>(
    '/admin/write-ins/adjudications/:contestId/',
    (request, response) => {
      const { contestId } = request.params;
      response.json(store.getAdjudicationsByContestId(contestId));
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
