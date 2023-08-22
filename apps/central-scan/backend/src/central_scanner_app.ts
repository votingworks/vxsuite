import { Scan } from '@votingworks/api';
import {
  ArtifactAuthenticatorApi,
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { Result, assert, ok } from '@votingworks/basics';
import {
  exportCastVoteRecordReportToUsbDrive,
  Exporter,
  Usb,
  readBallotPackageFromUsb,
  getContestsForBallotPage,
} from '@votingworks/backend';
import {
  BallotPackageConfigurationError,
  BallotPageLayout,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
  SystemSettings,
  safeParse,
  TEST_JURISDICTION,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  isElectionManagerAuth,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import express, { Application } from 'express';
import * as grout from '@votingworks/grout';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { backupToUsbDrive } from './backup';
import { Importer } from './importer';
import { Workspace } from './util/workspace';
import { DefaultMarkThresholds } from './store';
import { SCAN_ALLOWED_EXPORT_PATTERNS } from './globals';

type NoParams = never;

export interface AppOptions {
  auth: DippedSmartCardAuthApi;
  artifactAuthenticator: ArtifactAuthenticatorApi;
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
  const jurisdiction = workspace.store.getJurisdiction();
  const systemSettings = workspace.store.getSystemSettings();
  return {
    ...(systemSettings ?? DEFAULT_SYSTEM_SETTINGS),
    electionHash: electionDefinition?.electionHash,
    jurisdiction,
  };
}

function buildApi({
  auth,
  artifactAuthenticator,
  workspace,
  logger,
  usb,
  importer,
}: Exclude<AppOptions, 'allowedExportPatterns'>) {
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

    getTestMode() {
      return store.getTestMode();
    },

    async setTestMode(input: { testMode: boolean }) {
      const userRole = await getUserRole();
      const { testMode } = input;
      await logger.log(LogEventId.TogglingTestMode, userRole, {
        message: `Toggling to ${testMode ? 'Test' : 'Official'} Ballot Mode...`,
      });
      importer.setTestMode(testMode);
      await logger.log(LogEventId.ToggledTestMode, userRole, {
        disposition: 'success',
        message: `Successfully toggled to ${
          testMode ? 'Test' : 'Official'
        } Ballot Mode`,
      });
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

    /* c8 ignore start */
    // This is only used in Cypress tests.
    async configureWithSampleBallotPackageForIntegrationTest(): Promise<void> {
      const { electionGridLayoutNewHampshireAmherstFixtures } = await import(
        '@votingworks/fixtures'
      );
      const ballotPackage =
        electionGridLayoutNewHampshireAmherstFixtures.electionJson.toBallotPackage();
      const { electionDefinition } = ballotPackage;
      const systemSettings = DEFAULT_SYSTEM_SETTINGS;

      importer.configure(electionDefinition, TEST_JURISDICTION);
      store.setSystemSettings(systemSettings);
    },
    /* c8 ignore stop */

    async configureFromBallotPackageOnUsbDrive(): Promise<
      Result<ElectionDefinition, BallotPackageConfigurationError>
    > {
      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace)
      );
      const [usbDrive] = await usb.getUsbDrives();
      assert(usbDrive?.mountPoint !== undefined, 'No USB drive mounted');

      const ballotPackageResult = await readBallotPackageFromUsb(
        authStatus,
        artifactAuthenticator,
        usbDrive,
        logger
      );
      if (ballotPackageResult.isErr()) {
        return ballotPackageResult;
      }
      assert(isElectionManagerAuth(authStatus));
      const ballotPackage = ballotPackageResult.ok();
      const { electionDefinition, systemSettings } = ballotPackage;
      assert(systemSettings);

      importer.configure(electionDefinition, authStatus.user.jurisdiction);
      store.setSystemSettings(systemSettings);

      const userRole = await getUserRole();
      await logger.log(LogEventId.ElectionConfigured, userRole, {
        message: `Machine configured for election with hash: ${electionDefinition.electionHash}`,
        disposition: 'success',
        electionHash: electionDefinition.electionHash,
      });

      return ok(electionDefinition);
    },

    getSystemSettings(): SystemSettings {
      return workspace.store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
    },

    getElectionDefinition(): ElectionDefinition | null {
      return store.getElectionDefinition() || null;
    },

    async unconfigure(
      input: {
        ignoreBackupRequirement?: boolean;
      } = {}
    ): Promise<void> {
      const userRole = await getUserRole();

      // frontend should only allow this call if the machine can be unconfigured
      assert(store.getCanUnconfigure() || input.ignoreBackupRequirement);

      importer.unconfigure();
      await logger.log(LogEventId.ElectionUnconfigured, userRole, {
        disposition: 'success',
        message:
          'User successfully unconfigured the machine to remove the current election and all current ballot data.',
      });
    },

    async clearBallotData(): Promise<void> {
      const userRole = await getUserRole();
      const currentNumberOfBallots = store.getBallotsCounted();

      // frontend should only allow this call if the machine can be unconfigured
      assert(store.getCanUnconfigure());

      await logger.log(LogEventId.ClearingBallotData, userRole, {
        message: `Removing all ballot data, clearing ${currentNumberOfBallots} ballots...`,
        currentNumberOfBallots,
      });
      importer.doZero();
      await logger.log(LogEventId.ClearedBallotData, userRole, {
        disposition: 'success',
        message: 'Successfully cleared all ballot data.',
      });
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
export function buildCentralScannerApp({
  auth,
  artifactAuthenticator,
  allowedExportPatterns = SCAN_ALLOWED_EXPORT_PATTERNS,
  importer,
  workspace,
  logger,
  usb,
}: AppOptions): Application {
  const { store } = workspace;

  const app: Application = express();
  const api = buildApi({
    auth,
    artifactAuthenticator,
    workspace,
    logger,
    usb,
    importer,
  });
  app.use('/api', grout.buildRouter(api, express));
  useDevDockRouter(app, express);

  const deprecatedApiRouter = express.Router();
  deprecatedApiRouter.use(express.raw());
  deprecatedApiRouter.use(
    express.json({ limit: '5mb', type: 'application/json' })
  );
  deprecatedApiRouter.use(express.urlencoded({ extended: false }));

  deprecatedApiRouter.post<
    NoParams,
    Scan.ScanBatchResponse,
    Scan.ScanBatchRequest
  >('/central-scanner/scan/scanBatch', async (_request, response) => {
    try {
      const batchId = await importer.startImport();
      response.json({ status: 'ok', batchId });
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
        definiteMarkThreshold:
          store.getMarkThresholds()?.definite ?? DefaultMarkThresholds.definite,
        artifactAuthenticator,
        disableOriginalSnapshots: isFeatureFlagEnabled(
          BooleanEnvironmentVariableName.DISABLE_CVR_ORIGINAL_SNAPSHOTS
        ),
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
      const imagePath = store.getBallotImagePath(sheetId, side);

      if (imagePath) {
        response.sendFile(imagePath);
      } else {
        response.status(404).end();
      }
    }
  );

  deprecatedApiRouter.get<NoParams, Scan.GetNextReviewSheetResponse>(
    '/central-scanner/scan/hmpb/review/next-sheet',
    (_request, response) => {
      const { election } = store.getElectionDefinition() as ElectionDefinition;
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
          frontLayout = front.layout;
          const contestIds = getContestsForBallotPage({
            election,
            ballotPageMetadata: front.metadata,
          }).map(({ id }) => id);
          frontDefinition = { contestIds };
        }

        if (sheet.back.interpretation.type === 'InterpretedHmpbPage') {
          const back = sheet.back.interpretation;
          const contestIds = getContestsForBallotPage({
            election,
            ballotPageMetadata: back.metadata,
          }).map(({ id }) => id);
          backLayout = back.layout;
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

  return app;
}
