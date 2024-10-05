import {
  DippedSmartCardAuthApi,
  generateSignedHashValidationQrCodeValue,
} from '@votingworks/auth';
import {
  createSystemCallApi,
  DiskSpaceSummary,
  ElectionRecord,
  exportCastVoteRecordsToUsbDrive,
  readSignedElectionPackageFromUsb,
} from '@votingworks/backend';
import { assert, ok, Optional, Result } from '@votingworks/basics';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import * as grout from '@votingworks/grout';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  BallotPageLayout,
  BallotSheetInfo,
  Contest,
  DEFAULT_SYSTEM_SETTINGS,
  DiagnosticRecord,
  ElectionDefinition,
  ElectionPackageConfigurationError,
  ExportCastVoteRecordsToUsbDriveError,
  SystemSettings,
} from '@votingworks/types';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import { isElectionManagerAuth } from '@votingworks/utils';
import express, { Application } from 'express';
import { performScanDiagnostic, ScanDiagnosticOutcome } from './diagnostic';
import { BatchScanner } from './fujitsu_scanner';
import { Importer } from './importer';
import { getMachineConfig } from './machine_config';
import { saveReadinessReport } from './readiness_report';
import { MachineConfig, ScanStatus } from './types';
import { constructAuthMachineState } from './util/auth';
import {
  logBatchStartFailure,
  logBatchStartSuccess,
  logScanBatchContinueFailure,
  logScanBatchContinueSuccess,
} from './util/logging';
import { Workspace } from './util/workspace';

export interface AppOptions {
  auth: DippedSmartCardAuthApi;
  allowedExportPatterns?: string[];
  scanner: BatchScanner;
  importer: Importer;
  workspace: Workspace;
  logger: Logger;
  usbDrive: UsbDrive;
}

function buildApi({
  auth,
  workspace,
  logger,
  usbDrive,
  scanner,
  importer,
}: Exclude<AppOptions, 'allowedExportPatterns'>) {
  const { store } = workspace;

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
      return usbDrive.eject();
    },

    getMachineConfig(): MachineConfig {
      return getMachineConfig();
    },

    getTestMode() {
      return store.getTestMode();
    },

    async setTestMode(input: { testMode: boolean }) {
      const { testMode } = input;
      await logger.logAsCurrentRole(LogEventId.TogglingTestMode, {
        message: `Toggling to ${testMode ? 'Test' : 'Official'} Ballot Mode...`,
      });
      await importer.setTestMode(testMode);
      await logger.logAsCurrentRole(LogEventId.ToggledTestMode, {
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
      const numberOfBallotsInBatch = workspace.store
        .getBatches()
        .find((batch) => batch.id === batchId)?.count;

      await logger.logAsCurrentRole(LogEventId.DeleteScanBatchInit, {
        message: `User deleting batch id ${batchId}...`,
        numberOfBallotsInBatch,
        batchId,
      });

      try {
        workspace.store.deleteBatch(batchId);
        await logger.logAsCurrentRole(LogEventId.DeleteScanBatchComplete, {
          disposition: 'success',
          message: `User successfully deleted batch id: ${batchId} containing ${numberOfBallotsInBatch} ballots.`,
          numberOfBallotsInBatch,
          batchId,
        });
      } catch (error) {
        assert(error instanceof Error);
        await logger.logAsCurrentRole(LogEventId.DeleteScanBatchComplete, {
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
        await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
          message: `Error configuring machine.`,
          disposition: 'failure',
          errorDetails: JSON.stringify(electionPackageResult.err()),
        });
        return electionPackageResult;
      }
      assert(isElectionManagerAuth(authStatus));
      const { electionPackage, electionPackageHash } =
        electionPackageResult.ok();
      const { electionDefinition, systemSettings } = electionPackage;
      assert(systemSettings);

      importer.configure(
        electionDefinition,
        authStatus.user.jurisdiction,
        electionPackageHash
      );
      store.setSystemSettings(systemSettings);

      await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
        message: `Machine configured for election with hash: ${electionDefinition.ballotHash}`,
        disposition: 'success',
        ballotHash: electionDefinition.ballotHash,
      });

      return ok(electionDefinition);
    },

    getSystemSettings(): SystemSettings {
      return workspace.store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
    },

    getElectionRecord(): ElectionRecord | null {
      return store.getElectionRecord() || null;
    },

    getStatus(): ScanStatus {
      return importer.getStatus();
    },

    async scanBatch(): Promise<void> {
      try {
        const batchId = await importer.startImport();
        await logBatchStartSuccess(logger, batchId);
      } catch (error) {
        assert(error instanceof Error);
        await logBatchStartFailure(logger, error);
      }
    },

    async continueScanning(input: { forceAccept: boolean }): Promise<void> {
      try {
        const { forceAccept } = input;
        importer.continueImport(input);
        await logScanBatchContinueSuccess(logger, forceAccept);
      } catch (error) {
        assert(error instanceof Error);
        await logScanBatchContinueFailure(logger, error);
      }
    },

    getNextSheetToReview(): Optional<{
      interpreted: BallotSheetInfo;
      layouts: {
        front?: BallotPageLayout;
        back?: BallotPageLayout;
      };
      definitions: {
        front?: {
          contestIds: ReadonlyArray<Contest['id']>;
        };
        back?: {
          contestIds: ReadonlyArray<Contest['id']>;
        };
      };
    }> {
      const sheet = store.getNextAdjudicationSheet();

      if (sheet) {
        let frontLayout: BallotPageLayout | undefined;
        let backLayout: BallotPageLayout | undefined;
        let frontDefinition: Optional<{
          contestIds: ReadonlyArray<Contest['id']>;
        }>;
        let backDefinition: Optional<{
          contestIds: ReadonlyArray<Contest['id']>;
        }>;

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

        return {
          interpreted: sheet,
          layouts: {
            front: frontLayout,
            back: backLayout,
          },
          definitions: {
            front: frontDefinition,
            back: backDefinition,
          },
        };
      }

      return undefined;
    },

    async unconfigure(
      input: {
        ignoreBackupRequirement?: boolean;
      } = {}
    ): Promise<void> {
      // frontend should only allow this call if the machine can be unconfigured
      assert(store.getCanUnconfigure() || input.ignoreBackupRequirement);

      await importer.unconfigure();
      await logger.logAsCurrentRole(LogEventId.ElectionUnconfigured, {
        disposition: 'success',
        message:
          'User successfully unconfigured the machine to remove the current election and all current ballot data.',
      });
    },

    async clearBallotData(): Promise<void> {
      // frontend should only allow this call if the machine can be unconfigured
      assert(store.getCanUnconfigure());

      await importer.doZero();
    },

    async exportCastVoteRecordsToUsbDrive(input: {
      isMinimalExport?: boolean;
    }): Promise<Result<void, ExportCastVoteRecordsToUsbDriveError>> {
      const logItem = input.isMinimalExport ? 'cast vote records' : 'backup';
      await logger.logAsCurrentRole(LogEventId.ExportCastVoteRecordsInit, {
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
        await logger.logAsCurrentRole(
          LogEventId.ExportCastVoteRecordsComplete,
          {
            disposition: 'failure',
            message: `Error exporting ${logItem}.`,
            errorDetails: JSON.stringify(exportResult.err()),
          }
        );
      } else {
        await logger.logAsCurrentRole(
          LogEventId.ExportCastVoteRecordsComplete,
          {
            disposition: 'success',
            message: `Successfully exported ${logItem}.`,
          }
        );
      }
      return exportResult;
    },

    saveReadinessReport() {
      return saveReadinessReport({
        workspace,
        isScannerAttached: importer.getStatus().isScannerAttached,
        usbDrive,
        logger,
      });
    },

    async performScanDiagnostic(): Promise<ScanDiagnosticOutcome> {
      return await performScanDiagnostic(scanner, store, logger);
    },

    getMostRecentScannerDiagnostic(): DiagnosticRecord | null {
      return store.getMostRecentDiagnosticRecord('blank-sheet-scan') ?? null;
    },

    async getApplicationDiskSpaceSummary(): Promise<DiskSpaceSummary> {
      return workspace.getDiskSpaceSummary();
    },

    /* istanbul ignore next */
    async generateSignedHashValidationQrCodeValue() {
      const { codeVersion, machineId } = getMachineConfig();
      const electionRecord = store.getElectionRecord();
      await logger.logAsCurrentRole(LogEventId.SignedHashValidationInit);
      const qrCodeValue = await generateSignedHashValidationQrCodeValue({
        electionRecord,
        machineId,
        softwareVersion: codeVersion,
      });
      await logger.logAsCurrentRole(LogEventId.SignedHashValidationComplete, {
        disposition: 'success',
      });
      return qrCodeValue;
    },

    ...createSystemCallApi({
      usbDrive,
      logger,
      machineId: getMachineConfig().machineId,
      codeVersion: getMachineConfig().codeVersion,
    }),
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
  scanner,
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
    scanner,
    importer,
  });
  app.use('/api', grout.buildRouter(api, express));
  useDevDockRouter(app, express, 'central-scan');

  const assetsApi = express.Router();
  assetsApi.use(express.raw());
  assetsApi.use(express.json({ limit: '5mb', type: 'application/json' }));
  assetsApi.use(express.urlencoded({ extended: false }));

  assetsApi.get(
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

  app.use(assetsApi);

  return app;
}
