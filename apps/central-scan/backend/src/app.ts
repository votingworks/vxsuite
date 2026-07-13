import {
  DippedSmartCardAuthApi,
  generateSignedHashValidationQrCodeValue,
} from '@votingworks/auth';
import {
  Result,
  assert,
  assertDefined,
  err,
  iter,
  ok,
} from '@votingworks/basics';
import {
  AcceptedSheet,
  buildBatchManifest,
  buildCastVoteRecordFiles,
  createSystemCallApi,
  readSignedElectionPackageFromDirectory,
  exportCastVoteRecordsToUsbDrive,
  ElectionRecord,
  ScannerStateUnchangedByExport,
  VX_MACHINE_ID,
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
import makeDebug from 'debug';
import * as grout from '@votingworks/grout';
import { LogEventId, Logger } from '@votingworks/logging';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fetch from 'node-fetch';
import { loadImageMetadata } from '@votingworks/image-utils';
import { Importer } from './importer';
import { Workspace } from './util/workspace';
import {
  BallotImage,
  HostConnectionInfo,
  MachineConfig,
  ScanStatus,
  SendCastVoteRecordsToHostError,
} from './types';
import { AdminHostClient } from './networking';
import { zipFilesToBuffer } from './util/zip';
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

const debug = makeDebug('scan:send-cvrs');

export interface AppOptions {
  auth: DippedSmartCardAuthApi;
  allowedExportPatterns?: string[];
  scanner: BatchScanner;
  importer: Importer;
  workspace: Workspace;
  logger: Logger;
  usbDrive: UsbDrive;
  adminHostClient?: AdminHostClient;
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
  isDeskProScanner = false,
}: Exclude<AppOptions, 'allowedExportPatterns'>) {
  const { store } = workspace;

  let sendCvrsProgress: { sent: number; total: number } | undefined;

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

    getSendCvrsProgress(): { sent: number; total: number } | null {
      return sendCvrsProgress ?? null;
    },

    async sendCastVoteRecordsToHost(): Promise<
      Result<
        { newlyAdded: number; alreadyPresent: number },
        SendCastVoteRecordsToHostError
      >
    > {
      const hostConnection = adminHostClient?.getHostConnection();
      if (!hostConnection) {
        return err({ type: 'no-host-connected' });
      }

      async function logFailure(message: string): Promise<void> {
        await logger.logAsCurrentRole(
          LogEventId.ExportCastVoteRecordsComplete,
          {
            disposition: 'failure',
            message: `Error sending cast vote records to VxAdmin host. ${message}`,
          }
        );
      }

      await logger.logAsCurrentRole(LogEventId.ExportCastVoteRecordsInit, {
        message: `Sending cast vote records to VxAdmin host ${hostConnection.machineId}...`,
      });
      try {
        const { electionDefinition } = assertDefined(store.getElectionRecord());
        const systemSettings = assertDefined(store.getSystemSettings());
        const scannerState: ScannerStateUnchangedByExport = {
          batches: store.getBatches(),
          electionDefinition,
          systemSettings,
          inTestMode: store.getTestMode(),
          markThresholds: systemSettings.markThresholds,
        };
        const acceptedSheets = iter(store.forEachSheet())
          .filter((sheet): sheet is AcceptedSheet => sheet.type === 'accepted')
          .toArray();

        const startResult = await hostConnection.apiClient.startCvrTransfer({
          machineId: getMachineConfig().machineId,
          batchManifest: buildBatchManifest({
            batches: scannerState.batches,
            scannerId: VX_MACHINE_ID,
          }),
          isTestMode: scannerState.inTestMode,
        });
        if (startResult.isErr()) {
          const message = `Host refused the transfer: ${JSON.stringify(
            startResult.err()
          )}`;
          await logFailure(message);
          return err({ type: 'upload-failed', message });
        }
        const { sessionId } = startResult.ok();
        const uploadUrl = `${hostConnection.address}/api/cvr-transfer/${sessionId}/cvr`;

        // Build and send each cast vote record individually so that progress
        // is observable and memory usage stays bounded
        const transferStartTimeMs = Date.now();
        let totalBytesSent = 0;
        let sent = 0;
        sendCvrsProgress = { sent, total: acceptedSheets.length };
        for (const sheet of acceptedSheets) {
          const buildStartTimeMs = Date.now();
          const buildResult = await buildCastVoteRecordFiles(
            scannerState,
            sheet
          );
          if (buildResult.isErr()) {
            await logFailure(
              `Error building cast vote record: ${JSON.stringify(
                buildResult.err()
              )}`
            );
            return err({ type: 'export-failed', error: buildResult.err() });
          }
          const { castVoteRecordId, files } = buildResult.ok();
          const zipBuffer = await zipFilesToBuffer(
            files.map((file) => ({
              path: join(castVoteRecordId, file.fileName),
              contents: file.open(),
            }))
          );
          const uploadStartTimeMs = Date.now();
          const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/zip' },
            body: zipBuffer,
          });
          if (!response.ok) {
            const message = `Host responded with status ${
              response.status
            }: ${await response.text()}`;
            await logFailure(message);
            return err({ type: 'upload-failed', message });
          }
          const uploadEndTimeMs = Date.now();
          totalBytesSent += zipBuffer.byteLength;
          sent += 1;
          sendCvrsProgress = { sent, total: acceptedSheets.length };
          debug(
            'sent cvr %s (%d/%d): %d bytes, build+zip %dms, upload %dms',
            castVoteRecordId,
            sent,
            acceptedSheets.length,
            zipBuffer.byteLength,
            uploadStartTimeMs - buildStartTimeMs,
            uploadEndTimeMs - uploadStartTimeMs
          );
        }

        const finishResult = await hostConnection.apiClient.finishCvrTransfer({
          sessionId,
        });
        if (finishResult.isErr()) {
          const message = `Host failed to complete the transfer: ${JSON.stringify(
            finishResult.err()
          )}`;
          await logFailure(message);
          return err({ type: 'upload-failed', message });
        }
        const { newlyAdded, alreadyPresent } = finishResult.ok();
        const transferDurationMs = Date.now() - transferStartTimeMs;
        const totalMegabytesSent = totalBytesSent / 1024 / 1024;
        const megabytesPerSecond =
          transferDurationMs > 0
            ? totalMegabytesSent / (transferDurationMs / 1000)
            : 0;
        debug(
          'transfer complete: %d cast vote record(s), %s MB in %dms (%s MB/s)',
          sent,
          totalMegabytesSent.toFixed(2),
          transferDurationMs,
          megabytesPerSecond.toFixed(2)
        );
        await logger.logAsCurrentRole(
          LogEventId.ExportCastVoteRecordsComplete,
          {
            disposition: 'success',
            message: `Successfully sent cast vote records to VxAdmin host ${hostConnection.machineId}. Host imported ${newlyAdded} new cast vote record(s) and ignored ${alreadyPresent} duplicate(s).`,
            castVoteRecordsSent: sent,
            totalBytesSent,
            transferDurationMs,
            megabytesPerSecond: megabytesPerSecond.toFixed(2),
          }
        );
        return ok({ newlyAdded, alreadyPresent });
      } catch (error) {
        const message = error instanceof Error ? error.message : `${error}`;
        await logFailure(message);
        return err({ type: 'upload-failed', message });
      } finally {
        sendCvrsProgress = undefined;
      }
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
    isDeskProScanner,
  });
  app.use('/api', grout.buildRouter(api, express));

  return app;
}
