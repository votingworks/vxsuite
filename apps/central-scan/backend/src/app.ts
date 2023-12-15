import { Scan } from '@votingworks/api';
import {
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { Result, assert, assertDefined, ok } from '@votingworks/basics';
import {
  createLogsApi,
  readSignedElectionPackageFromUsb,
  exportCastVoteRecordsToUsbDrive,
} from '@votingworks/backend';
import {
  ElectionPackageConfigurationError,
  BallotPageLayout,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
  SystemSettings,
  safeParse,
  ExportCastVoteRecordsToUsbDriveError,
} from '@votingworks/types';
import { isElectionManagerAuth } from '@votingworks/utils';
import express, { Application } from 'express';
import * as grout from '@votingworks/grout';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import { Importer } from './importer';
import { Workspace } from './util/workspace';
import { getMachineConfig } from './machine_config';

type NoParams = never;

export interface AppOptions {
  auth: DippedSmartCardAuthApi;
  allowedExportPatterns?: string[];
  importer: Importer;
  workspace: Workspace;
  logger: Logger;
  usbDrive: UsbDrive;
}

function constructAuthMachineState(
  workspace: Workspace
): DippedSmartCardAuthMachineState {
  const electionDefinition = workspace.store.getElectionDefinition();
  const jurisdiction = workspace.store.getJurisdiction();
  const systemSettings =
    workspace.store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
  return {
    ...systemSettings.auth,
    electionHash: electionDefinition?.electionHash,
    jurisdiction,
  };
}

function buildApi({
  auth,
  workspace,
  logger,
  usbDrive,
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

    getUsbDriveStatus(): Promise<UsbDriveStatus> {
      return usbDrive.status();
    },

    async ejectUsbDrive(): Promise<void> {
      return usbDrive.eject(assertDefined(await getUserRole()));
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
        .getBatches()
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

    async configureFromElectionPackageOnUsbDrive(): Promise<
      Result<ElectionDefinition, ElectionPackageConfigurationError>
    > {
      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace)
      );

      const electionPackageResult = await readSignedElectionPackageFromUsb(
        authStatus,
        usbDrive,
        logger
      );
      if (electionPackageResult.isErr()) {
        return electionPackageResult;
      }
      assert(isElectionManagerAuth(authStatus));
      const electionPackage = electionPackageResult.ok();
      const { electionDefinition, systemSettings } = electionPackage;
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

    async exportCastVoteRecordsToUsbDrive(input: {
      isMinimalExport?: boolean;
    }): Promise<Result<void, ExportCastVoteRecordsToUsbDriveError>> {
      const userRole = assertDefined(await getUserRole());
      const logItem = input.isMinimalExport ? 'cast vote records' : 'backup';
      await logger.log(LogEventId.ExportCastVoteRecordsInit, userRole, {
        message: `Exporting ${logItem}...`,
      });
      const exportResult = await exportCastVoteRecordsToUsbDrive(
        store,
        usbDrive,
        input.isMinimalExport
          ? store.forEachAcceptedSheet()
          : store.forEachSheet(),
        { scannerType: 'central', isMinimalExport: input.isMinimalExport }
      );
      if (!input.isMinimalExport) {
        store.setScannerBackedUp();
      }
      if (exportResult.isErr()) {
        await logger.log(LogEventId.ExportCastVoteRecordsComplete, userRole, {
          disposition: 'failure',
          message: `Error exporting ${logItem}.`,
          errorDetails: JSON.stringify(exportResult.err()),
        });
      } else {
        await logger.log(LogEventId.ExportCastVoteRecordsComplete, userRole, {
          disposition: 'success',
          message: `Successfully exported ${logItem}.`,
        });
      }
      return exportResult;
    },

    ...createLogsApi({ usbDrive, machineId: getMachineConfig().machineId }),
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
  importer,
  workspace,
  logger,
  usbDrive,
}: AppOptions): Application {
  const { store } = workspace;

  const app: Application = express();
  const api = buildApi({
    auth,
    workspace,
    logger,
    usbDrive,
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
          const contestIds = Object.keys(front.votes);
          frontDefinition = { contestIds };
        }

        if (sheet.back.interpretation.type === 'InterpretedHmpbPage') {
          const back = sheet.back.interpretation;
          const contestIds = Object.keys(back.votes);

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

  app.use(deprecatedApiRouter);

  return app;
}
