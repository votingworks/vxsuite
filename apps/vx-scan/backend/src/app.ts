import { ErrorsResponse, OkResponse, Scan } from '@votingworks/api';
import { pdfToImages } from '@votingworks/image-utils';
import * as grout from '@votingworks/grout';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  BallotPageLayoutSchema,
  BallotPageLayoutWithImage,
  MarkThresholds,
  ok,
  PollsState,
  PrecinctSelection,
  Result,
  safeParseElectionDefinition,
  safeParseJson,
} from '@votingworks/types';
import {
  assert,
  find,
  generateFilenameForScanningResults,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
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
  machine: PrecinctScannerStateMachine,
  interpreter: PrecinctScannerInterpreter,
  workspace: Workspace,
  logger: Logger
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

    // eslint-disable-next-line @typescript-eslint/require-await
    async setElection(input: {
      // We transmit and store the election definition as a string, not as a
      // JSON object, since it will later be hashed to match the election hash
      // in ballot QR codes. Since the original hash was made from the string,
      // the most reliable way to get the same hash is to use the same string.
      electionData: string;
    }): Promise<void> {
      const parseResult = safeParseElectionDefinition(input.electionData);
      const electionDefinition = parseResult.assertOk(
        'Invalid election definition'
      );
      store.setElection(electionDefinition.electionData);
      // If the election has only one precinct, set it automatically
      if (electionDefinition.election.precincts.length === 1) {
        store.setPrecinctSelection(
          singlePrecinctSelectionFor(
            electionDefinition.election.precincts[0].id
          )
        );
      }
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async unconfigureElection(input: {
      ignoreBackupRequirement?: boolean;
    }): Promise<void> {
      assert(
        input.ignoreBackupRequirement || store.getCanUnconfigure(),
        'Attempt to unconfigure without backup'
      );
      interpreter.unconfigure();
      workspace.reset();
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async setPrecinctSelection(input: {
      precinctSelection: PrecinctSelection;
    }): Promise<void> {
      assert(
        store.getBallotsCounted() === 0,
        'Attempt to change precinct selection after ballots have been cast'
      );
      store.setPrecinctSelection(input.precinctSelection);
      workspace.resetElectionSession();
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async setMarkThresholdOverrides(input: {
      markThresholdOverrides?: MarkThresholds;
    }): Promise<void> {
      store.setMarkThresholdOverrides(input.markThresholdOverrides);
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async setIsSoundMuted(input: { isSoundMuted: boolean }): Promise<void> {
      store.setIsSoundMuted(input.isSoundMuted);
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async setTestMode(input: { isTestMode: boolean }): Promise<void> {
      workspace.resetElectionSession();
      store.setTestMode(input.isTestMode);
    },

    async setPollsState(input: { pollsState: PollsState }): Promise<void> {
      const previousPollsState = store.getPollsState();
      const newPollsState = input.pollsState;

      // Start new batch if opening polls, end batch if pausing or closing polls
      if (
        newPollsState === 'polls_open' &&
        previousPollsState !== 'polls_open'
      ) {
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

      store.setPollsState(newPollsState);
    },

    async recordBallotBagReplaced(): Promise<void> {
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
    },

    async backupToUsbDrive(): Promise<Result<void, Scan.BackupError>> {
      const result = await backupToUsbDrive(store);
      return result.isErr() ? result : ok();
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async getScannerStatus(): Promise<Scan.PrecinctScannerStatus> {
      const machineStatus = machine.status();
      const ballotsCounted = store.getBallotsCounted();
      const canUnconfigure = store.getCanUnconfigure();
      return {
        ...machineStatus,
        ballotsCounted,
        canUnconfigure,
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
  app.use('/api', grout.buildRouter(api, express));

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
