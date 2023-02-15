import { Scan } from '@votingworks/api';
import {
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { assert } from '@votingworks/basics';
import { Exporter } from '@votingworks/backend';
import {
  BallotPageLayout,
  BallotPageLayoutSchema,
  safeParse,
  safeParseElectionDefinition,
  safeParseJson,
} from '@votingworks/types';
import {
  generateElectionBasedSubfolderName,
  generateFilenameForScanningResults,
  readBallotPackageFromBuffer,
  SCANNER_RESULTS_FOLDER,
} from '@votingworks/utils';
import { Buffer } from 'buffer';
import makeDebug from 'debug';
import express, { Application } from 'express';
import * as fs from 'fs/promises';
import multer from 'multer';
import path from 'path';
import { PassThrough } from 'stream';
import { z } from 'zod';
import * as grout from '@votingworks/grout';
import { backupToUsbDrive } from './backup';
import { Importer } from './importer';
import { Workspace } from './util/workspace';
import { VX_MACHINE_ID } from './globals';

const debug = makeDebug('scan:central-scanner');

type NoParams = never;

export interface AppOptions {
  auth: DippedSmartCardAuthApi;
  exporter: Exporter;
  importer: Importer;
  workspace: Workspace;
}

function constructDippedSmartCardAuthMachineState(
  workspace: Workspace
): DippedSmartCardAuthMachineState {
  const electionDefinition = workspace.store.getElectionDefinition();
  return { electionHash: electionDefinition?.electionHash };
}

function buildApi(auth: DippedSmartCardAuthApi, workspace: Workspace) {
  return grout.createApi({
    getAuthStatus: () =>
      auth.getAuthStatus(constructDippedSmartCardAuthMachineState(workspace)),

    checkPin: (input: { pin: string }) =>
      auth.checkPin(constructDippedSmartCardAuthMachineState(workspace), input),

    logOut: () =>
      auth.logOut(constructDippedSmartCardAuthMachineState(workspace)),
  });
}

/**
 * A type to be used by the frontend to create a Grout API client
 */
export type Api = ReturnType<typeof buildApi>;

/**
 * Builds an express application, using `store` and `importer` to do the heavy
 * lifting.
 */
export async function buildCentralScannerApp({
  auth,
  exporter,
  importer,
  workspace,
}: AppOptions): Promise<Application> {
  const { store } = workspace;

  const app: Application = express();
  const api = buildApi(auth, workspace);
  app.use('/api', grout.buildRouter(api, express));

  const upload = multer({
    storage: multer.diskStorage({
      destination: workspace.uploadsPath,
    }),
  });

  const deprecatedApiRouter = express.Router();
  deprecatedApiRouter.use(express.raw());
  deprecatedApiRouter.use(
    express.json({ limit: '5mb', type: 'application/json' })
  );
  deprecatedApiRouter.use(express.urlencoded({ extended: false }));

  deprecatedApiRouter.get<NoParams, Scan.GetElectionConfigResponse>(
    '/central-scanner/config/election',
    (request, response) => {
      const electionDefinition = store.getElectionDefinition();

      if (request.accepts('application/octet-stream')) {
        if (electionDefinition) {
          response
            .header('content-type', 'application/octet-stream')
            .send(electionDefinition.electionData);
        } else {
          response.status(404).end();
        }
      } else {
        response.json(electionDefinition ?? null);
      }
    }
  );

  deprecatedApiRouter.patch<
    NoParams,
    Scan.PatchElectionConfigResponse,
    Scan.PatchElectionConfigRequest
  >('/central-scanner/config/election', (request, response) => {
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
    importer.configure(electionDefinition);
    response.json({ status: 'ok' });
  });

  deprecatedApiRouter.delete<NoParams, Scan.DeleteElectionConfigResponse>(
    '/central-scanner/config/election',
    (request, response) => {
      if (
        !store.getCanUnconfigure() &&
        request.query['ignoreBackupRequirement'] !== 'true' // A backup is required by default
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

      importer.unconfigure();
      response.json({ status: 'ok' });
    }
  );

  deprecatedApiRouter.put<
    '/central-scanner/config/package',
    NoParams,
    Scan.PutConfigPackageResponse,
    Scan.PutConfigPackageRequest
  >(
    '/central-scanner/config/package',
    upload.fields([{ name: 'package', maxCount: 1 }]),
    async (request, response) => {
      const file = !Array.isArray(request.files)
        ? request.files?.['package']?.[0]
        : undefined;

      try {
        if (!file) {
          response.status(400).json({
            status: 'error',
            errors: [
              {
                type: 'invalid-value',
                message: 'expected file field to be named "package"',
              },
            ],
          });
          return;
        }

        const pkg = await readBallotPackageFromBuffer(
          await fs.readFile(file.path)
        );

        importer.configure(pkg.electionDefinition);
        for (const { pdf, layout } of pkg.ballots) {
          await importer.addHmpbTemplates(pdf, layout);
        }

        response.json({ status: 'ok' });
      } finally {
        if (file) {
          await fs.unlink(file.path);
        }
      }
    }
  );

  deprecatedApiRouter.get<NoParams, Scan.GetTestModeConfigResponse>(
    '/central-scanner/config/testMode',
    (_request, response) => {
      const testMode = store.getTestMode();
      response.json({ status: 'ok', testMode });
    }
  );

  deprecatedApiRouter.patch<
    NoParams,
    Scan.PatchTestModeConfigResponse,
    Scan.PatchTestModeConfigRequest
  >('/central-scanner/config/testMode', async (request, response) => {
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

    await importer.setTestMode(bodyParseResult.ok().testMode);
    response.json({ status: 'ok' });
  });

  deprecatedApiRouter.get<
    NoParams,
    Scan.GetMarkThresholdOverridesConfigResponse
  >('/central-scanner/config/markThresholdOverrides', (_request, response) => {
    const markThresholdOverrides = store.getMarkThresholdOverrides();
    response.json({ status: 'ok', markThresholdOverrides });
  });

  deprecatedApiRouter.delete<
    NoParams,
    Scan.DeleteMarkThresholdOverridesConfigResponse
  >(
    '/central-scanner/config/markThresholdOverrides',
    async (_request, response) => {
      await importer.setMarkThresholdOverrides(undefined);
      response.json({ status: 'ok' });
    }
  );

  deprecatedApiRouter.patch<
    NoParams,
    Scan.PatchMarkThresholdOverridesConfigResponse,
    Scan.PatchMarkThresholdOverridesConfigRequest
  >(
    '/central-scanner/config/markThresholdOverrides',
    async (request, response) => {
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

      await importer.setMarkThresholdOverrides(
        bodyParseResult.ok().markThresholdOverrides
      );
      response.json({ status: 'ok' });
    }
  );

  deprecatedApiRouter.patch<
    NoParams,
    Scan.PatchSkipElectionHashCheckConfigResponse,
    Scan.PatchSkipElectionHashCheckConfigRequest
  >('/central-scanner/config/skipElectionHashCheck', (request, response) => {
    const bodyParseResult = safeParse(
      Scan.PatchSkipElectionHashCheckConfigRequestSchema,
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

    importer.setSkipElectionHashCheck(
      bodyParseResult.ok().skipElectionHashCheck
    );
    response.json({ status: 'ok' });
  });

  deprecatedApiRouter.post<
    NoParams,
    Scan.ScanBatchResponse,
    Scan.ScanBatchRequest
  >('/central-scanner/scan/scanBatch', async (_request, response) => {
    try {
      const batchId = await importer.startImport();
      response.json({ status: 'ok', batchId });
    } catch (err) {
      assert(err instanceof Error);
      response.json({
        status: 'error',
        errors: [{ type: 'scan-error', message: err.message }],
      });
    }
  });

  deprecatedApiRouter.post<
    NoParams,
    Scan.ScanContinueResponse,
    Scan.ScanContinueRequest
  >('/central-scanner/scan/scanContinue', async (request, response) => {
    const bodyParseResult = safeParse(
      Scan.ScanContinueRequestSchema,
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

    try {
      const continueImportOptions = bodyParseResult.ok();
      // NOTE: This is a little silly and TS should be able to reason this out, but no.
      if (continueImportOptions.forceAccept) {
        await importer.continueImport(continueImportOptions);
      } else {
        await importer.continueImport(continueImportOptions);
      }
      response.json({ status: 'ok' });
    } catch (error) {
      assert(error instanceof Error);
      response.json({
        status: 'error',
        errors: [{ type: 'scan-error', message: error.message }],
      });
    }
  });

  deprecatedApiRouter.post<
    NoParams,
    Scan.AddTemplatesResponse,
    Scan.AddTemplatesRequest
  >(
    '/central-scanner/scan/hmpb/addTemplates',
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

          await importer.addHmpbTemplates(
            await fs.readFile(ballotFile.path),
            layout
          );
        }

        response.json({ status: 'ok' });
      } catch (error) {
        assert(error instanceof Error);
        debug('error adding templates: %s', error.stack);
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
        for (const file of [...ballots, ...metadatas, ...layouts]) {
          await fs.unlink(file.path);
        }
      }
    }
  );

  deprecatedApiRouter.post(
    '/central-scanner/scan/hmpb/doneTemplates',
    async (_request, response) => {
      await importer.doneHmpbTemplates();
      response.json({ status: 'ok' });
    }
  );

  deprecatedApiRouter.post<
    NoParams,
    Scan.ExportToUsbDriveResponse,
    Scan.ExportToUsbDriveRequest
  >('/central-scanner/scan/export-to-usb-drive', async (_request, response) => {
    const electionDefinition = store.getElectionDefinition();
    if (!electionDefinition) {
      response.status(400).json({
        status: 'error',
        errors: [
          {
            type: 'no-election',
            message: 'cannot export cvrs if no election is configured',
          },
        ],
      });
      return;
    }

    const filename = generateFilenameForScanningResults(
      VX_MACHINE_ID,
      store.getBallotsCounted(),
      store.getTestMode(),
      new Date()
    );

    const exportStream = new PassThrough();
    const exportResultPromise = exporter.exportDataToUsbDrive(
      SCANNER_RESULTS_FOLDER,
      path.join(
        generateElectionBasedSubfolderName(
          electionDefinition.election,
          electionDefinition.electionHash
        ),
        filename
      ),
      exportStream
    );

    await importer.doExport(exportStream);
    exportStream.end();

    const exportResult = await exportResultPromise;
    if (exportResult.isErr()) {
      response.status(500).json({
        status: 'error',
        errors: [
          {
            type: 'export-failed',
            message: exportResult.err().message,
          },
        ],
      });

      return;
    }

    store.setCvrsBackedUp();

    response.json({ status: 'ok' });
  });

  deprecatedApiRouter.get<NoParams, Scan.GetScanStatusResponse>(
    '/central-scanner/scan/status',
    (_request, response) => {
      const status = importer.getStatus();
      response.json(status);
    }
  );

  deprecatedApiRouter.get(
    '/central-scanner/scan/hmpb/ballot/:sheetId/:side/image',
    (request, response) => {
      const { sheetId, side } = request.params;

      if (
        typeof sheetId !== 'string' ||
        (side !== 'front' && side !== 'back')
      ) {
        response.status(404);
        return;
      }

      response.redirect(
        301,
        `/central-scanner/scan/hmpb/ballot/${sheetId}/${side}/image/normalized`
      );
    }
  );

  deprecatedApiRouter.get(
    '/central-scanner/scan/hmpb/ballot/:sheetId/:side/image/:version',
    (request, response) => {
      const { sheetId, side, version } = request.params;

      if (
        typeof sheetId !== 'string' ||
        (side !== 'front' && side !== 'back') ||
        (version !== 'original' && version !== 'normalized')
      ) {
        response.status(404);
        return;
      }
      const filenames = store.getBallotFilenames(sheetId, side);

      if (filenames && version in filenames) {
        response.sendFile(filenames[version]);
      } else {
        response.status(404).end();
      }
    }
  );

  deprecatedApiRouter.delete(
    '/central-scanner/scan/batch/:batchId',
    (request, response) => {
      if (store.deleteBatch(request.params.batchId)) {
        response.json({ status: 'ok' });
      } else {
        response.status(404).end();
      }
    }
  );

  deprecatedApiRouter.get<NoParams, Scan.GetNextReviewSheetResponse>(
    '/central-scanner/scan/hmpb/review/next-sheet',
    (_request, response) => {
      const sheet = store.getNextAdjudicationSheet();

      if (sheet) {
        let frontLayout: BallotPageLayout | undefined;
        let backLayout: BallotPageLayout | undefined;
        let frontDefinition:
          | Scan.GetNextReviewSheetResponse['definitions']['front']
          | undefined;
        let backDefinition:
          | Scan.GetNextReviewSheetResponse['definitions']['back']
          | undefined;

        if (sheet.front.interpretation.type === 'InterpretedHmpbPage') {
          const front = sheet.front.interpretation;
          const layouts = store.getBallotPageLayoutsForMetadata(front.metadata);
          const contestIds = store.getContestIdsForMetadata(front.metadata);
          frontLayout = layouts.find(
            ({ metadata }) => metadata.pageNumber === front.metadata.pageNumber
          );
          frontDefinition = { contestIds };
        }

        if (sheet.back.interpretation.type === 'InterpretedHmpbPage') {
          const back = sheet.back.interpretation;
          const layouts = store.getBallotPageLayoutsForMetadata(back.metadata);
          const contestIds = store.getContestIdsForMetadata(back.metadata);
          backLayout = layouts.find(
            ({ metadata }) => metadata.pageNumber === back.metadata.pageNumber
          );
          backDefinition = { contestIds };
        }

        response.json({
          interpreted: sheet,
          layouts: {
            front: frontLayout,
            back: backLayout,
          },
          definitions: {
            front: frontDefinition,
            back: backDefinition,
          },
        });
      } else {
        response.status(404).end();
      }
    }
  );

  deprecatedApiRouter.post<NoParams, Scan.ZeroResponse, Scan.ZeroRequest>(
    '/central-scanner/scan/zero',
    (_request, response) => {
      if (!store.getCanUnconfigure()) {
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

      importer.doZero();
      response.json({ status: 'ok' });
    }
  );

  deprecatedApiRouter.post<
    NoParams,
    Scan.BackupToUsbResponse,
    Scan.BackupToUsbRequest
  >('/central-scanner/scan/backup-to-usb-drive', async (_request, response) => {
    const result = await backupToUsbDrive(exporter, store);

    if (result.isErr()) {
      response.status(500).json({
        status: 'error',
        errors: [result.err()],
      });
      return;
    }

    response.json({ status: 'ok', paths: result.ok() });
  });

  app.use(deprecatedApiRouter);

  // NOTE: this appears to cause web requests to block until restoreConfig is done.
  // if restoreConfig ends up on a background thread, we'll want to explicitly
  // return a "status: notready" or something like it.
  //
  // but for now, this seems to be fine, the front-end just waits.
  await importer.restoreConfig();

  return app;
}
