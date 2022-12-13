import { ErrorsResponse, OkResponse, Scan } from '@votingworks/api';
import { pdfToImages } from '@votingworks/image-utils';
import * as grout from '@votingworks/grout';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  BallotPageLayoutSchema,
  BallotPageLayoutWithImage,
  safeParse,
  safeParseElectionDefinition,
  safeParseJson,
} from '@votingworks/types';
import {
  assert,
  find,
  generateFilenameForScanningResults,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { Buffer } from 'buffer';
import express, { Application } from 'express';
import * as fs from 'fs/promises';
import multer from 'multer';
import { pipeline } from 'stream/promises';
import { z } from 'zod';
import { backupToUsbDrive } from './backup';
import { exportCastVoteRecordsAsNdJson } from './cvrs/export';
import { PrecinctScannerInterpreter } from './interpret';
import { PrecinctScannerStateMachine } from './state_machine';
import { rootDebug } from './util/debug';
import { Workspace } from './util/workspace';

const debug = rootDebug.extend('app');

type NoParams = never;

function buildApi(
  _machine: PrecinctScannerStateMachine,
  _interpreter: PrecinctScannerInterpreter,
  workspace: Workspace,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _logger: Logger
) {
  const { store } = workspace;
  return grout.createApi({
    // eslint-disable-next-line @typescript-eslint/require-await
    async getConfig(): Promise<Scan.PrecinctScannerConfig> {
      return {
        electionDefinition: store.getElectionDefinition(),
        precinctSelection: store.getPrecinctSelection(),
        markThresholdOverrides: store.getMarkThresholdOverrides(),
        isSoundMuted: store.getIsSoundMuted(),
        isTestMode: store.getTestMode(),
        pollsState: store.getPollsState(),
        ballotCountWhenBallotBagLastReplaced:
          store.getBallotCountWhenBallotBagLastReplaced(),
      };
    },
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(
  machine: PrecinctScannerStateMachine,
  interpreter: PrecinctScannerInterpreter,
  workspace: Workspace,
  logger: Logger
): Application {
  const { store } = workspace;

  const app: Application = express();

  const api = buildApi(machine, interpreter, workspace, logger);
  const apiRouter = express.Router();
  apiRouter.use(express.text({ type: 'application/json' }));
  grout.registerRoutes(api, apiRouter);
  app.use('/api', apiRouter);

  const deprecatedApiRouter = express.Router();

  const upload = multer({
    storage: multer.diskStorage({
      destination: workspace.uploadsPath,
    }),
  });

  deprecatedApiRouter.use(express.raw());
  deprecatedApiRouter.use(
    express.json({ limit: '5mb', type: 'application/json' })
  );
  deprecatedApiRouter.use(express.urlencoded({ extended: false }));

  deprecatedApiRouter.patch<
    NoParams,
    Scan.PatchElectionConfigResponse,
    Scan.PatchElectionConfigRequest
  >('/precinct-scanner/config/election', (request, response) => {
    const { body } = request;

    if (!Buffer.isBuffer(body)) {
      response.status(400).json({
        status: 'error',
        errors: [
          {
            type: 'invalid-value',
            message: `expected content type to be application/octet-stream, got ${request.header(
              'content-type'
            )}`,
          },
        ],
      });
      return;
    }

    const bodyParseResult = safeParseElectionDefinition(
      new TextDecoder('utf-8', { fatal: false }).decode(body)
    );

    if (bodyParseResult.isErr()) {
      const error = bodyParseResult.err();
      response.status(400).json({
        status: 'error',
        errors: [
          {
            type: error.name,
            message: error.message,
          },
        ],
      });
      return;
    }

    const electionDefinition = bodyParseResult.ok();
    store.setElection(electionDefinition.electionData);
    // If the election has only one precinct, set it automatically
    if (electionDefinition.election.precincts.length === 1) {
      store.setPrecinctSelection(
        singlePrecinctSelectionFor(electionDefinition.election.precincts[0].id)
      );
    }
    response.json({ status: 'ok' });
  });

  deprecatedApiRouter.delete<NoParams, Scan.DeleteElectionConfigResponse>(
    '/precinct-scanner/config/election',
    (request, response) => {
      if (
        !store.getCanUnconfigure() &&
        request.query['ignoreBackupRequirement'] !== 'true'
      ) {
        response.status(400).json({
          status: 'error',
          errors: [
            {
              type: 'no-backup',
              message:
                'cannot unconfigure an election that has not been backed up',
            },
          ],
        });
        return;
      }

      interpreter.unconfigure();
      workspace.reset();
      response.json({ status: 'ok' });
    }
  );

  deprecatedApiRouter.patch<
    NoParams,
    Scan.PatchPrecinctSelectionConfigResponse,
    Scan.PatchPrecinctSelectionConfigRequest
  >('/precinct-scanner/config/precinct', (request, response) => {
    const bodyParseResult = safeParse(
      Scan.PatchPrecinctSelectionConfigRequestSchema,
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

    if (store.getBallotsCounted() > 0) {
      response.status(400).json({
        status: 'error',
        errors: [
          {
            type: 'ballots-cast',
            message:
              'cannot change the precinct selection if ballots have been cast',
          },
        ],
      });
      return;
    }

    store.setPrecinctSelection(bodyParseResult.ok().precinctSelection);
    workspace.resetElectionSession();
    response.json({ status: 'ok' });
  });

  deprecatedApiRouter.patch<
    NoParams,
    Scan.PatchMarkThresholdOverridesConfigResponse,
    Scan.PatchMarkThresholdOverridesConfigRequest
  >('/precinct-scanner/config/markThresholdOverrides', (request, response) => {
    const bodyParseResult = safeParse(
      Scan.PatchMarkThresholdOverridesConfigRequestSchema,
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

    store.setMarkThresholdOverrides(
      bodyParseResult.ok().markThresholdOverrides
    );

    response.json({ status: 'ok' });
  });

  deprecatedApiRouter.delete<
    NoParams,
    Scan.DeleteMarkThresholdOverridesConfigResponse
  >('/precinct-scanner/config/markThresholdOverrides', (_request, response) => {
    store.setMarkThresholdOverrides(undefined);
    response.json({ status: 'ok' });
  });

  deprecatedApiRouter.patch<
    NoParams,
    Scan.PatchIsSoundMutedConfigResponse,
    Scan.PatchIsSoundMutedConfigRequest
  >('/precinct-scanner/config/isSoundMuted', (request, response) => {
    const bodyParseResult = safeParse(
      Scan.PatchIsSoundMutedConfigRequestSchema,
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

    store.setIsSoundMuted(bodyParseResult.ok().isSoundMuted);
    response.json({ status: 'ok' });
  });

  deprecatedApiRouter.patch<
    NoParams,
    Scan.PatchTestModeConfigResponse,
    Scan.PatchTestModeConfigRequest
  >('/precinct-scanner/config/testMode', (request, response) => {
    const bodyParseResult = safeParse(
      Scan.PatchTestModeConfigRequestSchema,
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

    workspace.resetElectionSession();
    store.setTestMode(bodyParseResult.ok().testMode);
    response.json({ status: 'ok' });
  });

  deprecatedApiRouter.patch<
    NoParams,
    Scan.PatchPollsStateResponse,
    Scan.PatchPollsStateRequest
  >('/precinct-scanner/config/polls', async (request, response) => {
    const bodyParseResult = safeParse(
      Scan.PatchPollsStateRequestSchema,
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

    const previousPollsState = store.getPollsState();
    const newPollsState = bodyParseResult.ok().pollsState;

    // Start new batch if opening polls, end batch if pausing or closing polls
    if (newPollsState === 'polls_open' && previousPollsState !== 'polls_open') {
      const batchId = store.addBatch();
      await logger.log(LogEventId.ScannerBatchStarted, 'system', {
        disposition: 'success',
        message:
          'New scanning batch started due to polls being opened or voting being resumed.',
        batchId,
      });
    } else if (
      newPollsState !== 'polls_open' &&
      previousPollsState === 'polls_open'
    ) {
      const ongoingBatchId = store.getOngoingBatchId();
      assert(typeof ongoingBatchId === 'string');
      store.finishBatch({ batchId: ongoingBatchId });
      await logger.log(LogEventId.ScannerBatchEnded, 'system', {
        disposition: 'success',
        message:
          'Current scanning batch ended due to polls being closed or voting being paused.',
        batchId: ongoingBatchId,
      });
    }

    store.setPollsState(bodyParseResult.ok().pollsState);
    response.json({ status: 'ok' });
  });

  deprecatedApiRouter.patch<NoParams, Scan.PatchBallotBagReplaced>(
    '/precinct-scanner/config/ballotBagReplaced',
    async (_request, response) => {
      // If polls are open, we need to end current batch and start a new batch
      if (store.getPollsState() === 'polls_open') {
        const ongoingBatchId = store.getOngoingBatchId();
        assert(typeof ongoingBatchId === 'string');
        store.finishBatch({ batchId: ongoingBatchId });
        await logger.log(LogEventId.ScannerBatchEnded, 'system', {
          disposition: 'success',
          message:
            'Current scanning batch ended due to ballot bag replacement.',
          batchId: ongoingBatchId,
        });

        const batchId = store.addBatch();
        await logger.log(LogEventId.ScannerBatchStarted, 'system', {
          disposition: 'success',
          message: 'New scanning batch started due to ballot bag replacement.',
          batchId,
        });
      }

      store.setBallotCountWhenBallotBagLastReplaced(store.getBallotsCounted());
      response.json({ status: 'ok' });
    }
  );

  deprecatedApiRouter.post<
    NoParams,
    Scan.AddTemplatesResponse,
    Scan.AddTemplatesRequest
  >(
    '/precinct-scanner/config/addTemplates',
    upload.fields([
      { name: 'ballots' },
      { name: 'metadatas' },
      { name: 'layouts' },
    ]),
    async (request, response) => {
      /* istanbul ignore next */
      if (Array.isArray(request.files) || request.files === undefined) {
        response.status(400).json({
          status: 'error',
          errors: [
            {
              type: 'missing-ballot-files',
              message: `expected ballot files in "ballots", "metadatas", and "layouts" fields, but no files were found`,
            },
          ],
        });
        return;
      }

      const { ballots = [], metadatas = [], layouts = [] } = request.files;

      try {
        if (ballots.length === 0) {
          response.status(400).json({
            status: 'error',
            errors: [
              {
                type: 'missing-ballot-files',
                message: `expected ballot files in "ballots", "metadatas", and "layouts" fields, but no files were found`,
              },
            ],
          });
          return;
        }

        const electionDefinition = store.getElectionDefinition();
        assert(electionDefinition);

        for (let i = 0; i < ballots.length; i += 1) {
          const ballotFile = ballots[i];
          const metadataFile = metadatas[i];
          const layoutFile = layouts[i];

          if (ballotFile?.mimetype !== 'application/pdf') {
            response.status(400).json({
              status: 'error',
              errors: [
                {
                  type: 'invalid-ballot-type',
                  message: `expected ballot files to be application/pdf, but got ${ballotFile?.mimetype}`,
                },
              ],
            });
            return;
          }

          if (metadataFile?.mimetype !== 'application/json') {
            response.status(400).json({
              status: 'error',
              errors: [
                {
                  type: 'invalid-metadata-type',
                  message: `expected ballot metadata to be application/json, but got ${metadataFile?.mimetype}`,
                },
              ],
            });
            return;
          }

          if (layoutFile.mimetype !== 'application/json') {
            response.status(400).json({
              status: 'error',
              errors: [
                {
                  type: 'invalid-layout-type',
                  message: `expected ballot layout to be application/json, but got ${layoutFile?.mimetype}`,
                },
              ],
            });
            return;
          }

          const layout = safeParseJson(
            await fs.readFile(layoutFile.path, 'utf8'),
            z.array(BallotPageLayoutSchema)
          ).unsafeUnwrap();

          const pdf = await fs.readFile(ballotFile.path);
          const result: BallotPageLayoutWithImage[] = [];

          for await (const { page, pageNumber } of pdfToImages(pdf, {
            scale: 2,
          })) {
            const ballotPageLayout = find(
              layout,
              (l) => l.metadata.pageNumber === pageNumber
            );
            result.push({ ballotPageLayout, imageData: page });
          }

          store.addHmpbTemplate(
            pdf,
            result[0].ballotPageLayout.metadata,
            result
          );
        }

        response.json({ status: 'ok' });
      } catch (error) {
        assert(error instanceof Error);
        response.status(500).json({
          status: 'error',
          errors: [
            {
              type: 'internal-server-error',
              message: error.message,
            },
          ],
        });
      } finally {
        // remove uploaded files
        for (const file of [...ballots, ...metadatas, ...layouts]) {
          await fs.unlink(file.path);
        }
      }
    }
  );

  deprecatedApiRouter.post<NoParams, Scan.ExportResponse, Scan.ExportRequest>(
    '/precinct-scanner/export',
    async (request, response) => {
      const skipImages = request.body?.skipImages;
      debug(`exporting CVRs ${skipImages ? 'without' : 'with'} inline images`);

      const cvrFilename = generateFilenameForScanningResults(
        // TODO: Move machine config provider to shared utilities and access
        // actual machine config, with dev overrides, here instead
        'NO-ID',
        store.getBallotsCounted(),
        store.getTestMode(),
        new Date()
      );

      response
        .header('Content-Type', 'text/plain; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${cvrFilename}"`);

      await pipeline(
        exportCastVoteRecordsAsNdJson({ store, skipImages }),
        response
      );

      store.setCvrsBackedUp();
    }
  );

  deprecatedApiRouter.post<
    NoParams,
    Scan.BackupToUsbResponse,
    Scan.BackupToUsbRequest
  >('/precinct-scanner/backup-to-usb-drive', async (_request, response) => {
    const result = await backupToUsbDrive(store);

    if (result.isErr()) {
      response.status(500).json({
        status: 'error',
        errors: [result.err()],
      });
      return;
    }

    response.json({ status: 'ok', paths: result.ok() });
  });

  deprecatedApiRouter.get<NoParams, Scan.GetPrecinctScannerStatusResponse>(
    '/precinct-scanner/scanner/status',
    (_request, response) => {
      const machineStatus = machine.status();
      const ballotsCounted = store.getBallotsCounted();
      const canUnconfigure = store.getCanUnconfigure();
      response.json({
        ...machineStatus,
        ballotsCounted,
        canUnconfigure,
      });
    }
  );

  deprecatedApiRouter.post<NoParams, OkResponse | ErrorsResponse>(
    '/precinct-scanner/scanner/scan',
    async (_request, response) => {
      if (store.getPollsState() !== 'polls_open') {
        response.status(400).json({
          status: 'error',
          errors: [
            {
              type: 'polls-closed',
              message: 'cannot scan ballots while polls are closed',
            },
          ],
        });
        return;
      }

      const electionDefinition = store.getElectionDefinition();
      const precinctSelection = store.getPrecinctSelection();
      const layouts = await store.loadLayouts();
      assert(electionDefinition);
      assert(precinctSelection);
      assert(layouts);
      interpreter.configure({
        electionDefinition,
        precinctSelection,
        layouts,
        testMode: store.getTestMode(),
        markThresholdOverrides: store.getMarkThresholdOverrides(),
        ballotImagesPath: workspace.ballotImagesPath,
      });

      machine.scan();
      response.json({ status: 'ok' });
    }
  );

  deprecatedApiRouter.post<NoParams, OkResponse>(
    '/precinct-scanner/scanner/accept',
    (_request, response) => {
      machine.accept();
      response.json({ status: 'ok' });
    }
  );

  deprecatedApiRouter.post<NoParams, OkResponse>(
    '/precinct-scanner/scanner/return',
    (_request, response) => {
      machine.return();
      response.json({ status: 'ok' });
    }
  );

  deprecatedApiRouter.post<NoParams, Scan.CalibrateResponse>(
    '/precinct-scanner/scanner/calibrate',
    async (_request, response) => {
      const result = await machine.calibrate();
      if (result.isOk()) {
        response.json({ status: 'ok' });
      } else {
        response.json({
          status: 'error',
          errors: [{ type: 'error', message: result.err() }],
        });
      }
    }
  );

  app.use(deprecatedApiRouter);

  return app;
}
