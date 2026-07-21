import {
  DippedSmartCardAuthApi,
  generateSignedHashValidationQrCodeValue,
} from '@votingworks/auth';
import { Result, assert, assertDefined, ok } from '@votingworks/basics';
import {
  createSystemCallApi,
  readSignedElectionPackageFromDirectory,
  exportCastVoteRecordsToUsbDrive,
  ElectionRecord,
} from '@votingworks/backend';
import {
  ElectionPackageConfigurationError,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
  SystemSettings,
  ExportCastVoteRecordsToUsbDriveError,
  DiagnosticRecord,
  DiagnosticOutcome,
  Rect,
  mapSheet,
  pollingPlaceFromElection,
  SheetInterpretation,
  SheetOf,
} from '@votingworks/types';
import { combinePageInterpretationsForSheet } from '@votingworks/ballot-interpreter';
import { isElectionManagerAuth } from '@votingworks/utils';
import express, { Application } from 'express';
import * as grout from '@votingworks/grout';
import { LogEventId, Logger } from '@votingworks/logging';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import { readFile } from 'node:fs/promises';
import { loadImageMetadata } from '@votingworks/image-utils';
import { Importer } from './importer';
import { Workspace } from './util/workspace';
import {
  BallotImage,
  CvrSyncStatus,
  HostConnectionInfo,
  MachineConfig,
  ScanStatus,
} from './types';
import { AdminHostClient } from './networking';
import { CvrSync } from './cvr_sync';
import { getMachineConfig } from './machine_config';
import { constructAuthMachineState } from './util/auth';
import {
  logBatchStartFailure,
  logBatchStartSuccess,
  logScanBatchContinueFailure,
  logScanBatchContinueSuccess,
} from './util/logging';
import { saveReadinessReport } from './readiness_report';
import { performScanDiagnostic, ScanDiagnosticOutcome } from './diagnostic';
import { BatchScanner } from './fujitsu_scanner';

export interface AppOptions {
  auth: DippedSmartCardAuthApi;
  allowedExportPatterns?: string[];
  scanner: BatchScanner;
  importer: Importer;
  workspace: Workspace;
  logger: Logger;
  usbDrive: UsbDrive;
  adminHostClient?: AdminHostClient;
  cvrSync?: CvrSync;
  isDeskProScanner?: boolean;
}

function buildApi({
  auth,
  workspace,
  logger,
  usbDrive,
  scanner,
  importer,
  adminHostClient,
  cvrSync,
  isDeskProScanner = false,
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

      const usbDriveStatus = await usbDrive.status();
      assert(usbDriveStatus.status === 'mounted', 'No USB drive mounted');

      const electionPackageResult =
        await readSignedElectionPackageFromDirectory(
          authStatus,
          usbDriveStatus.mountpoint,
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

      const absenteePollingPlaces = assertDefined(
        electionDefinition.election.pollingPlaces
      ).filter((pollingPlace) => pollingPlace.type === 'absentee');
      if (absenteePollingPlaces.length === 1) {
        store.setPollingPlaceId(absenteePollingPlaces[0].id);
      }

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

    getScannerConfig(): { isDeskProScanner: boolean } {
      return { isDeskProScanner };
    },

    getElectionRecord(): ElectionRecord | null {
      return store.getElectionRecord() || null;
    },

    getPollingPlaceId(): string | null {
      return store.getPollingPlaceId() ?? null;
    },

    setPollingPlaceId(input: { id: string }): void {
      const electionRecord = assertDefined(
        store.getElectionRecord(),
        'Cannot set polling place without an election.'
      );
      assert(
        store.getBatches().length === 0,
        'Attempt to change polling place after scanning has begun'
      );
      const { name } = pollingPlaceFromElection(
        electionRecord.electionDefinition.election,
        input.id
      );
      store.setPollingPlaceId(input.id);
      void logger.logAsCurrentRole(LogEventId.PollingPlaceChanged, {
        disposition: 'success',
        message: `User set the polling place for the machine to ${name}`,
      });
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

    async getNextReviewSheet(): Promise<{
      sheetInterpretation: SheetInterpretation;
      images: SheetOf<BallotImage>;
    } | null> {
      const sheet = store.getNextAdjudicationSheet();

      if (!sheet) {
        return null;
      }

      const { election } = assertDefined(
        store.getElectionRecord()
      ).electionDefinition;
      const sheetInterpretation = combinePageInterpretationsForSheet(
        sheet.pages,
        election
      );

      const images = await mapSheet(
        sheet.pages,
        async (interpretation, side): Promise<BallotImage> => {
          const imagePath = assertDefined(
            store.getBallotImagePath(sheet.id, side)
          );
          const imageBuffer = await readFile(imagePath);
          const metadata = (
            await loadImageMetadata(imageBuffer)
          ).unsafeUnwrap();
          const { type, width, height } = metadata;
          const imageUrl = `data:${type};base64,${imageBuffer.toString(
            'base64'
          )}`;
          const ballotBounds: Rect = { x: 0, y: 0, width, height };
          return {
            imageUrl,
            ballotBounds,
            layout:
              interpretation.type === 'InterpretedHmpbPage'
                ? interpretation.layout
                : undefined,
          };
        }
      );

      return {
        sheetInterpretation,
        images,
      };
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

    async continueBatch(): Promise<void> {
      try {
        importer.continueBatch();
        await logger.logAsCurrentRole(LogEventId.ScanBatchContinue, {
          disposition: 'success',
          message: 'User continued scanning the paused batch.',
        });
      } catch (error) {
        assert(error instanceof Error);
        await logger.logAsCurrentRole(LogEventId.ScanBatchContinue, {
          disposition: 'failure',
          message: `User attempt to continue the paused batch failed: ${error.message}`,
        });
      }
    },

    async saveBatch(): Promise<void> {
      try {
        // `finishBatch` logs batch completion on success.
        await importer.saveBatch();
        // Send the newly saved batch to a connected VxAdmin host right away
        // rather than waiting for the next sync polling tick.
        void cvrSync?.triggerSync();
      } catch (error) {
        assert(error instanceof Error);
        await logger.logAsCurrentRole(LogEventId.ScanBatchComplete, {
          disposition: 'failure',
          message: `User attempt to save the paused batch failed: ${error.message}`,
        });
      }
    },

    async cancelBatch(): Promise<void> {
      const status = importer.getStatus();
      const batchId = status.currentBatch?.batchId;
      const numberOfBallotsInBatch = status.batches.find(
        (batch) => batch.id === batchId
      )?.count;

      await logger.logAsCurrentRole(LogEventId.DeleteScanBatchInit, {
        message: `User canceling batch id ${batchId}...`,
        numberOfBallotsInBatch,
        batchId,
      });

      try {
        await importer.cancelBatch();
        await logger.logAsCurrentRole(LogEventId.DeleteScanBatchComplete, {
          disposition: 'success',
          message: `User successfully canceled batch id: ${batchId} containing ${numberOfBallotsInBatch} ballots.`,
          numberOfBallotsInBatch,
          batchId,
        });
      } catch (error) {
        assert(error instanceof Error);
        await logger.logAsCurrentRole(LogEventId.DeleteScanBatchComplete, {
          disposition: 'failure',
          message: `Error canceling batch id: ${batchId}.`,
          error: error.message,
          result: 'Batch not canceled.',
        });
        throw error;
      }
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

    async exportCastVoteRecordsToUsbDrive(): Promise<
      Result<void, ExportCastVoteRecordsToUsbDriveError>
    > {
      await logger.logAsCurrentRole(LogEventId.ExportCastVoteRecordsInit, {
        message: 'Exporting all accepted and rejected cast vote records...',
      });
      const exportResult = await exportCastVoteRecordsToUsbDrive(
        store,
        usbDrive,
        store.forEachSheet(),
        { scannerType: 'central' }
      );
      store.setScannerBackedUp();
      if (exportResult.isErr()) {
        await logger.logAsCurrentRole(
          LogEventId.ExportCastVoteRecordsComplete,
          {
            disposition: 'failure',
            message: `Error exporting all accepted and rejected cast vote records.`,
            errorDetails: JSON.stringify(exportResult.err()),
          }
        );
      } else {
        await logger.logAsCurrentRole(
          LogEventId.ExportCastVoteRecordsComplete,
          {
            disposition: 'success',
            message: `Successfully exported all accepted and rejected cast vote records.`,
          }
        );
      }
      return exportResult;
    },

    getHostConnectionInfo(): HostConnectionInfo {
      return adminHostClient?.getHostConnectionInfo() ?? { status: 'offline' };
    },

    getCvrSyncStatus(): CvrSyncStatus {
      return cvrSync?.getStatus() ?? { state: 'idle', unsentBatchCount: 0 };
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

    getMostRecentUpsDiagnostic(): DiagnosticRecord | null {
      return (
        store.getMostRecentDiagnosticRecord('uninterruptible-power-supply') ??
        null
      );
    },

    async logUpsDiagnosticOutcome(input: {
      outcome: DiagnosticOutcome;
    }): Promise<void> {
      const { outcome } = input;
      let message =
        'The user indicated the UPS is not connected or not fully charged.';
      let disposition = 'failure';

      if (outcome === 'pass') {
        message = 'The user confirmed the UPS is connected and fully charged.';
        disposition = 'success';
      }

      const record: DiagnosticRecord = {
        type: 'uninterruptible-power-supply',
        outcome,
        message,
        timestamp: new Date().valueOf(),
      };
      store.addDiagnosticRecord(record);

      await logger.logAsCurrentRole(LogEventId.DiagnosticComplete, {
        disposition,
        message,
      });
    },

    /* istanbul ignore start */
    async generateSignedHashValidationQrCodeValue() {
      const { codeVersion } = getMachineConfig();
      const electionRecord = store.getElectionRecord();
      await logger.logAsCurrentRole(LogEventId.SignedHashValidationInit);
      const qrCodeValue = await generateSignedHashValidationQrCodeValue({
        electionRecord,
        softwareVersion: codeVersion,
      });
      await logger.logAsCurrentRole(LogEventId.SignedHashValidationComplete, {
        disposition: 'success',
      });
      return qrCodeValue;
    },
    /* istanbul ignore stop */

    ...createSystemCallApi({
      usbDrive,
      logger,
      machineId: getMachineConfig().machineId,
      codeVersion: getMachineConfig().codeVersion,
      workspacePath: workspace.path,
      getAuthStatus: /* istanbul ignore next */ () =>
        auth.getAuthStatus(constructAuthMachineState(workspace)),
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
  adminHostClient,
  cvrSync,
  isDeskProScanner,
}: AppOptions): Application {
  const app: Application = express();
  const api = buildApi({
    auth,
    workspace,
    logger,
    usbDrive,
    scanner,
    importer,
    adminHostClient,
    cvrSync,
    isDeskProScanner,
  });
  app.use('/api', grout.buildRouter(api, express));

  return app;
}
