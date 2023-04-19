import { Scan } from '@votingworks/api';
import {
  DEV_JURISDICTION,
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { Result, assert, ok } from '@votingworks/basics';
import {
  exportCastVoteRecordReportToUsbDrive,
  Exporter,
  Usb,
  readBallotPackageFromUsb,
} from '@votingworks/backend';
import {
  BallotPackageConfigurationError,
  BallotPageLayout,
  BallotPageLayoutSchema,
  ElectionDefinition,
  SystemSettings,
  safeParse,
  safeParseElectionDefinition,
  safeParseJson,
} from '@votingworks/types';
import { readBallotPackageFromBuffer } from '@votingworks/utils';
import { Buffer } from 'buffer';
import makeDebug from 'debug';
import express, { Application } from 'express';
import * as fs from 'fs/promises';
import multer from 'multer';
import { z } from 'zod';
import * as grout from '@votingworks/grout';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import { backupToUsbDrive } from './backup';
import { Importer } from './importer';
import { Workspace } from './util/workspace';
import { DefaultMarkThresholds } from './store';
import { SCAN_ALLOWED_EXPORT_PATTERNS } from './globals';

const debug = makeDebug('scan:central-scanner');

type NoParams = never;

export interface AppOptions {
  auth: DippedSmartCardAuthApi;
  allowedExportPatterns?: string[];
  importer: Importer;
  workspace: Workspace;
  logger: Logger;
  usb: Usb;
}

function constructAuthMachineState(
  workspace: Workspace
): DippedSmartCardAuthMachineState {
  const electionDefinition = workspace.store.getElectionDefinition();
  return {
    electionHash: electionDefinition?.electionHash,
    // TODO: Persist jurisdiction in store and pull from there
    jurisdiction: DEV_JURISDICTION,
  };
}

function buildApi({
  auth,
  workspace,
  logger,
  usb,
  importer,
}: Pick<AppOptions, 'auth' | 'workspace' | 'logger' | 'usb' | 'importer'>) {
  const { store } = workspace;

  async function getUserRole(): Promise<LoggingUserRole> {
    const authStatus = await auth.getAuthStatus(
      constructAuthMachineState(workspace)
    );
    return authStatus.status === 'logged_in' ? authStatus.user.role : 'unknown';
  }

  return grout.createApi({
    getAuthStatus() {
      return auth.getAuthStatus(constructAuthMachineState(workspace));
    },

    checkPin(input: { pin: string }) {
      return auth.checkPin(constructAuthMachineState(workspace), input);
    },

    logOut() {
      return auth.logOut(constructAuthMachineState(workspace));
    },

    updateSessionExpiry(input: { sessionExpiresAt: Date }) {
      return auth.updateSessionExpiry(
        constructAuthMachineState(workspace),
        input
      );
    },

    async deleteBatch({ batchId }: { batchId: string }) {
      const userRole = await getUserRole();
      const numberOfBallotsInBatch = workspace.store
        .batchStatus()
        .find((batch) => batch.id === batchId)?.count;

      await logger.log(LogEventId.DeleteScanBatchInit, userRole, {
        message: `User deleting batch id ${batchId}...`,
        numberOfBallotsInBatch,
        batchId,
      });

      try {
        workspace.store.deleteBatch(batchId);
        await logger.log(LogEventId.DeleteScanBatchComplete, userRole, {
          disposition: 'success',
          message: `User successfully deleted batch id: ${batchId} containing ${numberOfBallotsInBatch} ballots.`,
          numberOfBallotsInBatch,
          batchId,
        });
      } catch (error) {
        assert(error instanceof Error);
        await logger.log(LogEventId.DeleteScanBatchComplete, userRole, {
          disposition: 'failure',
          message: `Error deleting batch id: ${batchId}.`,
          error: error.message,
          result: 'Batch not deleted.',
        });
        throw error;
      }
    },

    async configureFromBallotPackageOnUsbDrive(): Promise<
      Result<ElectionDefinition, BallotPackageConfigurationError>
    > {
      if (store.getElectionDefinition()) {
        store.setElection(undefined);
      }
      const [usbDrive] = await usb.getUsbDrives();
      assert(usbDrive?.mountPoint !== undefined, 'No USB drive mounted');

      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace)
      );

      const ballotPackageResult = await readBallotPackageFromUsb(
        authStatus,
        usbDrive,
        logger
      );
      if (ballotPackageResult.isErr()) {
        return ballotPackageResult;
      }

      const ballotPackage = ballotPackageResult.ok();
      const { electionDefinition, systemSettings, ballots } = ballotPackage;
      assert(systemSettings);
      store.setElection(electionDefinition.electionData);
      store.setSystemSettings(systemSettings);
      for (const ballot of ballots) {
        await importer.addHmpbTemplates(ballot.pdf, ballot.layout);
      }
      await importer.doneHmpbTemplates();

      return ok(electionDefinition);
    },

    getSystemSettings(): SystemSettings | null {
      return workspace.store.getSystemSettings() ?? null;
    },
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
  allowedExportPatterns = SCAN_ALLOWED_EXPORT_PATTERNS,
  importer,
  workspace,
  logger,
  usb,
}: AppOptions): Promise<Application> {
  const { store } = workspace;

  const app: Application = express();
  const api = buildApi({ auth, workspace, logger, usb, importer });
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

    const exportResult = await exportCastVoteRecordReportToUsbDrive(
      {
        electionDefinition,
        isTestMode: store.getTestMode(),
        ballotsCounted: store.getBallotsCounted(),
        batchInfo: store.batchStatus(),
        getResultSheetGenerator: store.forEachResultSheet.bind(store),
        ballotPageLayoutsLookup: store.getBallotPageLayoutsLookup(),
        definiteMarkThreshold:
          store.getCurrentMarkThresholds()?.definite ??
          DefaultMarkThresholds.definite,
      },
      usb.getUsbDrives
    );

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
    const result = await backupToUsbDrive(
      new Exporter({
        allowedExportPatterns,
        getUsbDrives: usb.getUsbDrives,
      }),
      store
    );

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
