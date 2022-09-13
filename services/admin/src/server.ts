import { Admin } from '@votingworks/api';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { Id, safeParse } from '@votingworks/types';
import multer from 'multer';
import express, { Application } from 'express';
import { readFileSync } from 'fs';
import { basename } from 'path';
import { ADMIN_WORKSPACE, PORT } from './globals';
import { Store } from './store';
import { createWorkspace, Workspace } from './util/workspace';

type NoParams = never;

const CVR_FILE_ATTACHMENT_NAME = 'cvrFile';
const MAX_UPLOAD_FILE_SIZE = 500 * 1024 * 1024; // 500MB

/**
 * Builds an express application.
 */
export function buildApp({ store }: { store: Store }): Application {
  const app: Application = express();
  const upload = multer({
    storage: multer.diskStorage({}),
    limits: { fileSize: MAX_UPLOAD_FILE_SIZE },
  });

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

  app.post<
    { electionId: Id },
    Admin.PostCvrFileResponse,
    Admin.PostCvrFileRequest
  >(
    '/admin/elections/:electionId/cvr-files',
    upload.fields([{ name: CVR_FILE_ATTACHMENT_NAME, maxCount: 1 }]),
    (request, response) => {
      const { electionId } = request.params;
      /* istanbul ignore next */
      const file = !Array.isArray(request.files)
        ? request.files?.[CVR_FILE_ATTACHMENT_NAME]?.[0]
        : undefined;

      if (!file) {
        response.status(400).json({
          status: 'error',
          errors: [
            {
              type: 'invalid-value',
              message: `expected file field to be named "${CVR_FILE_ATTACHMENT_NAME}"`,
            },
          ],
        });
        return;
      }

      const parseQueryResult = safeParse(
        Admin.PostCvrFileQueryParamsSchema,
        request.query
      );

      if (parseQueryResult.isErr()) {
        response.status(400).json({
          status: 'error',
          errors: [
            {
              type: 'ValidationError',
              message: parseQueryResult.err().message,
            },
          ],
        });
        return;
      }

      const { analyzeOnly } = parseQueryResult.ok();
      const filename = basename(file.originalname);
      const cvrFile = readFileSync(file.path, 'utf8');
      const result = store.addCastVoteRecordFile({
        electionId,
        filename,
        cvrFile,
        analyzeOnly,
      });

      if (result.isErr()) {
        response.status(400).json({
          status: 'error',
          errors: [
            {
              type: result.err().kind,
              message: JSON.stringify(result.err()),
            },
          ],
        });
        return;
      }

      const { id, wasExistingFile, newlyAdded, alreadyPresent } = result.ok();
      const body: Admin.PostCvrFileResponse = {
        status: 'ok',
        id,
        wasExistingFile,
        newlyAdded,
        alreadyPresent,
      };

      response.json(body);
    }
  );

  app.delete<
    { electionId: Id },
    Admin.DeleteCvrFileResponse,
    Admin.DeleteCvrFileRequest
  >('/admin/elections/:electionId/cvr-files', (request, response) => {
    const { electionId } = request.params;
    store.deleteCastVoteRecordFiles(electionId);
    response.json({ status: 'ok' });
  });

  app.get<{ electionId: Id }, Admin.GetWriteInsResponse>(
    '/admin/elections/:electionId/write-ins',
    (request, response) => {
      const parseQueryResult = safeParse(
        Admin.GetWriteInAdjudicationsQueryParamsSchema,
        request.query
      );

      if (parseQueryResult.isErr()) {
        response.status(400).json({
          status: 'error',
          errors: [
            {
              type: 'ValidationError',
              message: parseQueryResult.err().message,
            },
          ],
        });
        return;
      }

      const { contestId, status, limit } = parseQueryResult.ok();
      const { electionId } = request.params;
      response.json(
        store.getWriteInRecords({
          electionId,
          contestId,
          status,
          limit,
        })
      );
    }
  );

  app.put<
    { writeInId: Id },
    Admin.PutWriteInTranscriptionResponse,
    Admin.PutWriteInTranscriptionRequest
  >('/admin/write-ins/:writeInId/transcription', (request, response) => {
    const { writeInId } = request.params;
    const parseResult = safeParse(
      Admin.PutWriteInTranscriptionRequestSchema,
      request.body
    );

    if (parseResult.isErr()) {
      response.status(400).json({
        status: 'error',
        errors: [
          {
            type: 'ValidationError',
            message: parseResult.err().message,
          },
        ],
      });
      return;
    }

    store.transcribeWriteIn(writeInId, parseResult.ok().value);
    response.json({ status: 'ok' });
  });

  app.post<
    { electionId: Id },
    Admin.PostWriteInAdjudicationResponse,
    Admin.PostWriteInAdjudicationRequest
  >(
    '/admin/elections/:electionId/write-in-adjudications',
    (request, response) => {
      const { electionId } = request.params;
      const parseResult = safeParse(
        Admin.PostWriteInAdjudicationRequestSchema,
        request.body
      );

      if (parseResult.isErr()) {
        response.status(400).json({
          status: 'error',
          errors: [
            {
              type: 'ValidationError',
              message: parseResult.err().message,
            },
          ],
        });
        return;
      }

      const {
        contestId,
        transcribedValue,
        adjudicatedValue,
        adjudicatedOptionId,
      } = parseResult.ok();

      const id = store.createWriteInAdjudication({
        electionId,
        contestId,
        transcribedValue,
        adjudicatedValue,
        adjudicatedOptionId,
      });

      response.json({ status: 'ok', id });
    }
  );

  app.get<
    { electionId: Id },
    Admin.GetWriteInSummaryResponse,
    Admin.GetWriteInSummaryRequest,
    Admin.GetWriteInSummaryQueryParams
  >('/admin/elections/:electionId/write-in-summary', (request, response) => {
    const { electionId } = request.params;
    const parseQueryResult = safeParse(
      Admin.GetWriteInSummaryQueryParamsSchema,
      request.query
    );

    if (parseQueryResult.isErr()) {
      response.status(400).json({
        status: 'error',
        errors: [
          {
            type: 'ValidationError',
            message: parseQueryResult.err().message,
          },
        ],
      });
      return;
    }

    const { contestId } = parseQueryResult.ok();
    store.getWriteInRecords({ electionId });
    response.json(
      store.getWriteInAdjudicationSummary({ electionId, contestId })
    );
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
