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
  app.use(express.json({ limit: '50mb', type: 'application/json' }));
  app.use(express.urlencoded({ extended: false }));

  app.get<NoParams>('/admin/write-ins/cvrs/reset', (_, response) => {
    store.deleteCvrs();
    response.status(200).json({ status: 'ok' });
  });

  app.get<NoParams>('/admin/write-ins/cvr-files', (_, response) => {
    const cvrFiles = store.getAllCvrFiles();
    response.json(cvrFiles);
  });

  app.get('/admin/write-ins/adjudication/:id', (request, response) => {
    const { id } = request.params;

    const adjudication = store.getAdjudicationById(id);
    if (adjudication) {
      response.json(adjudication);
    } else {
      response.status(404).end();
    }
  });

  /* TODO: #2153 */
  /* istanbul ignore next */
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

      const {
        signature,
        name,
        precinctIds,
        scannerIds,
        timestamp,
        castVoteRecords,
      } = bodyParseResult.ok();
      const isTestMode =
        castVoteRecords.filter((cvr: any) => cvr._testBallot === true).length >
        0;
      const fileId = store.addCvrFile(
        signature,
        name,
        timestamp,
        scannerIds,
        precinctIds,
        isTestMode
      );
      let duplicateCvrCount = 0;
      for (const cvr of castVoteRecords) {
        const cvrId = store.addCvr(cvr._ballotId, fileId, JSON.stringify(cvr));
        if (cvrId === null) {
          // This was a duplicate cvr.
          duplicateCvrCount += 1;
          continue;
        }
        for (const [key, value] of Object.entries(cvr)) {
          if (Array.isArray(value) && !key.startsWith('_')) {
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

      store.updateCvrFileCounts(
        fileId,
        castVoteRecords.length - duplicateCvrCount,
        duplicateCvrCount
      );
      response.json({
        status: 'ok',
        importedCvrCount: castVoteRecords.length - duplicateCvrCount,
        duplicateCvrCount,
        isTestMode,
      });
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

  app.get('/admin/write-ins/adjudications/:contestId/', (request, response) => {
    const { contestId } = request.params;
    response.json(store.getAdjudicationsByContestId(contestId));
  });

  app.get<NoParams>('/admin/write-ins/transcribed-values', (_, response) => {
    const transcribedValues = store.getAllTranscribedValues();
    response.json(transcribedValues);
  });

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
