import { Admin } from '@votingworks/api';
import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import {
  BallotPageLayout,
  CandidateContest,
  getBallotStyle,
  getContests,
  Id,
  InlineBallotImage,
  Rect,
  safeParse,
  safeParseNumber,
} from '@votingworks/types';
import { zip } from '@votingworks/utils';
import express, { Application } from 'express';
import * as fs from 'fs/promises';
import multer from 'multer';
import { ADMIN_WORKSPACE, PORT } from './globals';
import { createWorkspace, Workspace } from './util/workspace';

type NoParams = never;

const CVR_FILE_ATTACHMENT_NAME = 'cvrFile';
const MAX_UPLOAD_FILE_SIZE = 2 * 1000 * 1024 * 1024; // 2GB

/**
 * Builds an express application.
 */
export function buildApp({ workspace }: { workspace: Workspace }): Application {
  const { store } = workspace;
  const app: Application = express();
  const upload = multer({
    storage: multer.diskStorage({
      destination: workspace.uploadsPath,
    }),
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

  app.patch<NoParams, Admin.PatchElectionResponse, Admin.PatchElectionRequest>(
    '/admin/elections/:electionId',
    (request, response) => {
      const parseResult = safeParse(
        Admin.PatchElectionRequestSchema,
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

      const { electionId } = request.params;
      const { isOfficialResults } = parseResult.ok();

      const election = store.getElection(electionId);
      if (!election) {
        response.status(404).json({
          status: 'error',
          errors: [{ type: 'NotFound', message: 'Election not found' }],
        });
        return;
      }

      if (typeof isOfficialResults === 'boolean') {
        store.setElectionResultsOfficial(electionId, isOfficialResults);
      }

      response.json({ status: 'ok' });
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
    async (request, response) => {
      /* istanbul ignore next */
      const file = !Array.isArray(request.files)
        ? request.files?.[CVR_FILE_ATTACHMENT_NAME]?.[0]
        : undefined;
      try {
        const { electionId } = request.params;

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

        const result = await store.addCastVoteRecordFile({
          electionId,
          filePath: file.path,
          originalFilename: file.originalname,
          analyzeOnly,
        });

        if (result.isErr()) {
          response.status(400).json({
            status: 'error',
            errors: [
              {
                type: result.err().kind,
                message:
                  result.err().userFriendlyMessage ||
                  JSON.stringify(result.err()),
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
      } finally {
        if (file) {
          await fs.unlink(file.path);
        }
      }
    }
  );

  app.delete<
    { electionId: Id },
    Admin.DeleteCvrFileResponse,
    Admin.DeleteCvrFileRequest
  >('/admin/elections/:electionId/cvr-files', (request, response) => {
    const { electionId } = request.params;
    store.deleteCastVoteRecordFiles(electionId);
    store.setElectionResultsOfficial(electionId, false);
    response.json({ status: 'ok' });
  });

  app.get<
    { electionId: Id },
    Admin.GetCvrFileModeResponse,
    Admin.GetCvrFileModeRequest
  >('/admin/elections/:electionId/cvr-file-mode', (request, response) => {
    const { electionId } = request.params;
    const cvrFileMode = store.getCurrentCvrFileModeForElection(electionId);

    response.json({
      status: 'ok',
      cvrFileMode,
    });
  });

  app.get<{ electionId: Id }, Admin.GetWriteInsResponse>(
    '/admin/elections/:electionId/write-ins',
    (request, response) => {
      const parseQueryResult = safeParse(
        Admin.GetWriteInsQueryParamsSchema,
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

  app.get<
    { electionId: Id },
    Admin.GetWriteInAdjudicationsResponse,
    Admin.GetWriteInAdjudicationsRequest,
    Admin.GetWriteInAdjudicationsQueryParams
  >(
    '/admin/elections/:electionId/write-in-adjudications',
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

      const { electionId } = request.params;
      const { contestId } = parseQueryResult.ok();

      const writeInAdjudications = store.getWriteInAdjudicationRecords({
        electionId,
        contestId,
      });

      response.json(writeInAdjudications);
    }
  );

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

  app.put<
    { writeInAdjudicationId: Id },
    Admin.PutWriteInAdjudicationResponse,
    Admin.PutWriteInAdjudicationRequest
  >(
    '/admin/write-in-adjudications/:writeInAdjudicationId',
    (request, response) => {
      const { writeInAdjudicationId } = request.params;
      const parseResult = safeParse(
        Admin.PutWriteInAdjudicationRequestSchema,
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

      store.updateWriteInAdjudication(writeInAdjudicationId, parseResult.ok());
      response.json({ status: 'ok' });
    }
  );

  app.delete<
    { writeInAdjudicationId: Id },
    Admin.DeleteWriteInAdjudicationResponse,
    Admin.DeleteWriteInAdjudicationRequest
  >(
    '/admin/write-in-adjudications/:writeInAdjudicationId',
    (request, response) => {
      const { writeInAdjudicationId } = request.params;
      store.deleteWriteInAdjudication(writeInAdjudicationId);
      response.json({ status: 'ok' });
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

    const { contestId, status } = parseQueryResult.ok();
    response.json(
      store.getWriteInAdjudicationSummary({
        electionId,
        contestId,
        status,
      })
    );
  });

  app.get<
    Admin.GetWriteInAdjudicationTableUrlParams,
    Admin.GetWriteInAdjudicationTableResponse,
    Admin.GetWriteInAdjudicationTableRequest
  >(
    '/admin/elections/:electionId/contests/:contestId/write-in-adjudication-table',
    (request, response) => {
      const { electionId, contestId } = request.params;
      const electionRecord = store.getElection(electionId);

      if (!electionRecord) {
        return response.status(404).end();
      }

      const contest = electionRecord.electionDefinition.election.contests.find(
        (c): c is CandidateContest =>
          c.type === 'candidate' && c.id === contestId
      );

      if (!contest) {
        return response.status(404).end();
      }

      const writeInSummaries = store
        .getWriteInAdjudicationSummary({
          electionId,
          contestId,
        })
        .filter(
          (s): s is Admin.WriteInSummaryEntryNonPending =>
            s.status !== 'pending'
        );

      const table = Admin.Views.writeInAdjudicationTable.render(
        contest,
        writeInSummaries
      );

      response.json({ status: 'ok', table });
    }
  );

  /* istanbul ignore next */
  app.get<
    { writeInId: Id },
    Admin.GetWriteInImageResponse,
    Admin.GetWriteInImageRequest
  >('/admin/write-in-image/:writeInId', (request, response) => {
    const { writeInId } = request.params;

    const castVoteRecordData = store.getCastVoteRecordForWriteIn(writeInId);
    if (!castVoteRecordData) {
      response.status(400).json({
        status: 'error',
        errors: [
          {
            type: 'invalid-value',
            message: `invalid write in Id`,
          },
        ],
      });
      return;
    }
    const { contestId, optionId, electionId, cvr } = castVoteRecordData;

    const electionRecord = store.getElection(electionId);
    if (!electionRecord) {
      response.status(400).json({
        status: 'error',
        errors: [
          {
            type: 'invalid-value',
            message: `invalid election Id`,
          },
        ],
      });
      return;
    }
    const { election } = electionRecord.electionDefinition;

    try {
      const ballotStyle = getBallotStyle({
        ballotStyleId: cvr._ballotStyleId,
        election,
      });
      if (cvr._layouts === undefined || cvr._ballotImages === undefined) {
        response.json([]); // The CVR does not have ballot images.
        return;
      }
      if (!ballotStyle) {
        throw new Error('unexpected types');
      }
      const allContestIdsForBallotStyle = getContests({
        ballotStyle,
        election,
      }).map((c) => c.id);
      const [layouts, ballotImages] = [...zip(cvr._layouts, cvr._ballotImages)]
        .sort(([a], [b]) => a.metadata.pageNumber - b.metadata.pageNumber)
        .reduce<[BallotPageLayout[], InlineBallotImage[]]>(
          ([layoutsAcc, ballotImagesAcc], [layout, ballotImage]) => [
            [...layoutsAcc, layout],
            [...ballotImagesAcc, ballotImage],
          ],
          [[], []]
        );
      let contestIdx = allContestIdsForBallotStyle.indexOf(contestId);
      let currentLayoutOptionIdx = 0;
      let currentLayout = layouts[currentLayoutOptionIdx];
      while (currentLayout && contestIdx >= currentLayout.contests.length) {
        // move to the next page, past the contests of the current page
        contestIdx -= currentLayout.contests.length;

        currentLayoutOptionIdx += 1;
        currentLayout = layouts[currentLayoutOptionIdx];
        if (!currentLayout) {
          throw new Error('unexpected types');
        }
      }
      currentLayout = layouts[currentLayoutOptionIdx];
      if (!currentLayout) {
        throw new Error('unexpected types');
      }
      const contestLayout =
        layouts[currentLayoutOptionIdx]?.contests[contestIdx];

      // Options are laid out from the bottom up, so we reverse write-ins to get the correct bounds
      const writeInOptions = contestLayout?.options
        .filter((option) => option.definition?.id.startsWith('write-in'))
        .reverse();

      const writeInOptionIndex = safeParseNumber(
        optionId.slice('write-in-'.length)
      );
      if (
        writeInOptionIndex.isErr() ||
        writeInOptions === undefined ||
        contestLayout === undefined
      ) {
        throw new Error('unexpected types');
      }
      const writeInLayout = writeInOptions[writeInOptionIndex.ok()];
      const currentBallotImage = ballotImages[currentLayoutOptionIdx];
      if (writeInLayout === undefined || currentBallotImage === undefined) {
        throw new Error('unexpected types');
      }
      const writeInBounds = writeInLayout.bounds;
      const contestBounds = contestLayout.bounds;
      const fullBallotBounds: Rect = {
        ...currentLayout.pageSize,
        x: 0,
        y: 0,
      };
      response.json([
        {
          image: currentBallotImage.normalized,
          ballotCoordinates: fullBallotBounds,
          contestCoordinates: contestBounds,
          writeInCoordinates: writeInBounds,
        },
      ]);
    } catch (error: unknown) {
      response.status(400).json({
        status: 'error',
        errors: [
          {
            type: 'unexpected-error',
            message:
              error instanceof Error ? error.message : 'unexpected error',
          },
        ],
      });
    }
  });

  app.post<
    { electionId: Id },
    Admin.PostPrintedBallotResponse,
    Admin.PostPrintedBallotRequest
  >('/admin/elections/:electionId/printed-ballots', (request, response) => {
    const { electionId } = request.params;
    const electionRecord = store.getElection(electionId);

    if (!electionRecord) {
      return response.status(404).json({
        status: 'error',
        errors: [
          {
            type: 'not-found',
            message: `No election found with id ${electionId}`,
          },
        ],
      });
    }

    const parseBodyResult = safeParse(
      Admin.PostPrintedBallotRequestSchema,
      request.body
    );

    if (parseBodyResult.isErr()) {
      return response.status(400).json({
        status: 'error',
        errors: [
          {
            type: 'invalid-value',
            message: parseBodyResult.err().message,
          },
        ],
      });
    }

    const id = store.addPrintedBallot(electionId, parseBodyResult.ok());

    response.json({ status: 'ok', id });
  });

  app.get<
    { electionId: Id },
    Admin.GetPrintedBallotsResponse,
    Admin.GetPrintedBallotsRequest
  >('/admin/elections/:electionId/printed-ballots', (request, response) => {
    const { electionId } = request.params;
    const electionRecord = store.getElection(electionId);

    if (!electionRecord) {
      return response.status(404).json({
        status: 'error',
        errors: [
          {
            type: 'not-found',
            message: `No election found with id ${electionId}`,
          },
        ],
      });
    }

    const parseQueryResult = safeParse(
      Admin.GetPrintedBallotsQueryParamsSchema,
      request.query
    );

    if (parseQueryResult.isErr()) {
      return response.status(400).json({
        status: 'error',
        errors: [
          {
            type: 'invalid-value',
            message: parseQueryResult.err().message,
          },
        ],
      });
    }

    const printedBallots = store.getPrintedBallots(
      electionId,
      parseQueryResult.ok()
    );

    response.json({ status: 'ok', printedBallots });
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

  // clear any cached data
  resolvedWorkspace.clearUploads();

  /* istanbul ignore next */
  const resolvedApp = app ?? buildApp({ workspace: resolvedWorkspace });

  resolvedApp.listen(port, async () => {
    await logger.log(LogEventId.ApplicationStartup, 'system', {
      message: `Admin Service running at http://localhost:${port}/`,
      disposition: 'success',
    });
  });
}
