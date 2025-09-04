import * as grout from '@votingworks/grout';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  ElectionPackageConfigurationError,
  DEFAULT_SYSTEM_SETTINGS,
  PrecinctSelection,
  SinglePrecinctSelection,
  DiagnosticRecord,
  DiagnosticOutcome,
} from '@votingworks/types';
import {
  getPrecinctSelectionName,
  isElectionManagerAuth,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import express, { Application } from 'express';
import {
  createUiStringsApi,
  createSystemCallApi,
  readSignedElectionPackageFromUsb,
  doesUsbDriveRequireCastVoteRecordSync as doesUsbDriveRequireCastVoteRecordSyncFn,
  configureUiStrings,
  DiskSpaceSummary,
  Exporter,
  SCAN_ALLOWED_EXPORT_PATTERNS,
  ExportDataResult,
} from '@votingworks/backend';
import { assert, assertDefined, ok, Result } from '@votingworks/basics';
import {
  InsertedSmartCardAuthApi,
  generateRandomAes256Key,
  generateSignedHashValidationQrCodeValue,
} from '@votingworks/auth';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import {
  FujitsuThermalPrinterInterface,
  PrinterStatus,
  PrintResult,
} from '@votingworks/fujitsu-thermal-printer';
import {
  PrecinctScannerStateMachine,
  PrecinctScannerConfig,
  PrecinctScannerStatus,
  PrecinctScannerPollsInfo,
} from './types';
import { constructAuthMachineState } from './util/auth';
import { Workspace } from './util/workspace';
import { getMachineConfig } from './machine_config';
import {
  exportCastVoteRecordsToUsbDrive,
  ExportCastVoteRecordsToUsbDriveResult,
} from './export';
import {
  openPolls,
  OpenPollsResult,
  closePolls,
  pauseVoting,
  resumeVoting,
  resetPollsToPaused,
} from './polls';
import { printTestPage } from './printing/test_print';
import { printReportSection } from './printing/print_report_section';
import {
  TEST_AUDIO_USER_FAIL_REASON,
  TEST_PRINT_USER_FAIL_REASON,
  TEST_UPS_USER_FAIL_REASON,
  TEST_UPS_USER_PASS_REASON,
  testPrintFailureDiagnosticMessage,
} from './util/diagnostics';
import { saveReadinessReport } from './printing/readiness_report';
import { Player as AudioPlayer, SoundName } from './audio/player';

export const BALLOT_AUDIT_ID_FILE_NAME = 'ballot-audit-id-secret-key.txt';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi({
  audioPlayer,
  auth,
  machine,
  workspace,
  usbDrive,
  printer,
  logger,
}: {
  audioPlayer: AudioPlayer;
  auth: InsertedSmartCardAuthApi;
  machine: PrecinctScannerStateMachine;
  workspace: Workspace;
  usbDrive: UsbDrive;
  printer: FujitsuThermalPrinterInterface;
  logger: Logger;
}) {
  const { store } = workspace;

  return grout.createApi({
    getMachineConfig,

    getAuthStatus() {
      return auth.getAuthStatus(constructAuthMachineState(workspace.store));
    },

    checkPin(input: { pin: string }) {
      return auth.checkPin(constructAuthMachineState(workspace.store), input);
    },

    logOut() {
      return auth.logOut(constructAuthMachineState(workspace.store));
    },

    updateSessionExpiry(input: { sessionExpiresAt: Date }) {
      return auth.updateSessionExpiry(
        constructAuthMachineState(workspace.store),
        input
      );
    },

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

    async getUsbDriveStatus(): Promise<
      UsbDriveStatus & { doesUsbDriveRequireCastVoteRecordSync?: true }
    > {
      const usbDriveStatus = await usbDrive.status();
      return {
        ...usbDriveStatus,
        doesUsbDriveRequireCastVoteRecordSync:
          (await doesUsbDriveRequireCastVoteRecordSyncFn(
            store,
            usbDriveStatus
          )) || undefined,
      };
    },

    async ejectUsbDrive(): Promise<void> {
      return usbDrive.eject();
    },

    async configureFromElectionPackageOnUsbDrive(): Promise<
      Result<void, ElectionPackageConfigurationError>
    > {
      assert(!store.getElectionRecord(), 'Already configured');

      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace.store)
      );
      const electionPackageResult = await readSignedElectionPackageFromUsb(
        authStatus,
        usbDrive,
        logger
      );
      if (electionPackageResult.isErr()) {
        await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
          disposition: 'failure',
          message: 'Error configuring machine.',
          errorDetails: JSON.stringify(electionPackageResult.err()),
        });
        return electionPackageResult;
      }
      assert(isElectionManagerAuth(authStatus));
      const { electionPackage, electionPackageHash } =
        electionPackageResult.ok();
      const { electionDefinition, systemSettings } = electionPackage;
      assert(systemSettings);
      let precinctSelection: SinglePrecinctSelection | undefined;
      if (electionDefinition.election.precincts.length === 1) {
        precinctSelection = singlePrecinctSelectionFor(
          electionDefinition.election.precincts[0].id
        );
      }

      await store.withTransaction(async () => {
        store.setElectionAndJurisdiction({
          electionData: electionDefinition.electionData,
          jurisdiction: authStatus.user.jurisdiction,
          electionPackageHash,
        });
        if (precinctSelection) {
          store.setPrecinctSelection(precinctSelection);
        }
        store.setSystemSettings(systemSettings);
        if (systemSettings.precinctScanEnableBallotAuditIds) {
          store.setBallotAuditIdSecretKey(await generateRandomAes256Key());
        }

        configureUiStrings({
          electionPackage,
          logger,
          noAudio: true,
          store: workspace.store.getUiStringsStore(),
        });
      });

      await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
        message: `Machine configured for election with hash: ${electionDefinition.ballotHash}`,
        disposition: 'success',
        ballotHash: electionDefinition.ballotHash,
      });
      return ok();
    },

    getConfig(): PrecinctScannerConfig {
      const electionRecord = store.getElectionRecord();
      return {
        electionDefinition: electionRecord?.electionDefinition,
        electionPackageHash: electionRecord?.electionPackageHash,
        systemSettings: store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS,
        precinctSelection: store.getPrecinctSelection(),
        isSoundMuted: store.getIsSoundMuted(),
        isTestMode: store.getTestMode(),
        isDoubleFeedDetectionDisabled: store.getIsDoubleFeedDetectionDisabled(),
        isContinuousExportEnabled: store.getIsContinuousExportEnabled(),
      };
    },

    getPollsInfo(): PrecinctScannerPollsInfo {
      const pollsState = store.getPollsState();
      if (pollsState === 'polls_closed_initial') {
        return {
          pollsState,
        };
      }

      return {
        pollsState,
        lastPollsTransition: assertDefined(store.getLastPollsTransition()),
      };
    },

    async unconfigureElection(): Promise<void> {
      workspace.reset();
      await logger.logAsCurrentRole(LogEventId.ElectionUnconfigured, {
        disposition: 'success',
        message:
          'User successfully unconfigured the machine to remove the current election and all current ballot data.',
      });
    },

    async setPrecinctSelection(input: {
      precinctSelection: PrecinctSelection;
    }): Promise<void> {
      const { electionDefinition } = assertDefined(store.getElectionRecord());
      assert(
        store.getBallotsCounted() === 0,
        'Attempt to change precinct selection after ballots have been cast'
      );
      store.setPrecinctSelection(input.precinctSelection);
      workspace.resetElectionSession();
      await logger.logAsCurrentRole(LogEventId.PrecinctConfigurationChanged, {
        disposition: 'success',
        message: `User set the precinct for the machine to ${getPrecinctSelectionName(
          electionDefinition.election.precincts,
          input.precinctSelection
        )}`,
      });
    },

    async setIsSoundMuted(input: { isSoundMuted: boolean }): Promise<void> {
      store.setIsSoundMuted(input.isSoundMuted);
      await logger.logAsCurrentRole(LogEventId.SoundToggled, {
        message: `Sounds were toggled ${input.isSoundMuted ? 'off' : 'on'}`,
        disposition: 'success',
        isSoundMuted: input.isSoundMuted,
      });
    },

    async setIsDoubleFeedDetectionDisabled(input: {
      isDoubleFeedDetectionDisabled: boolean;
    }): Promise<void> {
      store.setIsDoubleFeedDetectionDisabled(
        input.isDoubleFeedDetectionDisabled
      );
      await logger.logAsCurrentRole(LogEventId.DoubleSheetDetectionToggled, {
        message: `Double sheet detection was toggled ${
          input.isDoubleFeedDetectionDisabled ? 'off' : 'on'
        }`,
        disposition: 'success',
        isDoubleFeedDetectionDisabled: input.isDoubleFeedDetectionDisabled,
      });
    },

    async setIsContinuousExportEnabled(input: {
      isContinuousExportEnabled: boolean;
    }): Promise<void> {
      store.setIsContinuousExportEnabled(input.isContinuousExportEnabled);
      await logger.logAsCurrentRole(LogEventId.ContinuousExportToggled, {
        message: `Continuous export was ${
          input.isContinuousExportEnabled ? 'resumed' : 'paused'
        }`,
        disposition: 'success',
      });
    },

    async setTestMode(input: { isTestMode: boolean }): Promise<void> {
      const logMessage = input.isTestMode
        ? 'official to test'
        : 'test to official';
      await logger.logAsCurrentRole(LogEventId.TogglingTestMode, {
        message: `Toggling from ${logMessage} mode`,
        isTestMode: input.isTestMode,
      });
      // Use the continuous export mutex to ensure that any pending continuous export operations
      // finish first
      await workspace.continuousExportMutex.withLock(() =>
        workspace.resetElectionSession()
      );
      store.setTestMode(input.isTestMode);
      await logger.logAsCurrentRole(LogEventId.ToggledTestMode, {
        disposition: 'success',
        message: `Successfully toggled from ${logMessage} mode.`,
        isTestMode: input.isTestMode,
      });
    },

    async openPolls(): Promise<OpenPollsResult> {
      return openPolls({ store, logger });
    },

    async closePolls(): Promise<void> {
      return closePolls({ workspace, usbDrive, logger });
    },

    async pauseVoting(): Promise<void> {
      return pauseVoting({ store, logger });
    },

    async resumeVoting(): Promise<void> {
      return resumeVoting({ store, logger });
    },

    async resetPollsToPaused(): Promise<void> {
      return resetPollsToPaused({ store, logger });
    },

    async exportCastVoteRecordsToUsbDrive(input: {
      mode: 'full_export' | 'recovery_export';
    }): Promise<ExportCastVoteRecordsToUsbDriveResult> {
      return exportCastVoteRecordsToUsbDrive({
        mode: input.mode,
        workspace,
        usbDrive,
        logger,
      });
    },

    getPrinterStatus(): Promise<PrinterStatus> {
      return printer.getStatus();
    },

    /**
     * Prints a specific section of the report, e.g. for a particular party.
     */
    async printReportSection(input: { index: number }): Promise<PrintResult> {
      return printReportSection({
        store,
        printer,
        index: input.index,
      });
    },

    getScannerStatus(): PrecinctScannerStatus {
      const machineStatus = machine.status();
      const ballotsCounted = store.getBallotsCounted();
      return {
        ...machineStatus,
        ballotsCounted,
      };
    },

    acceptBallot(): void {
      machine.accept();
    },

    returnBallot(): void {
      machine.return();
    },

    readyForNextBallot(): void {
      machine.readyForNextBallot();
    },

    beginDoubleFeedCalibration(): void {
      machine.beginDoubleFeedCalibration();
    },

    endDoubleFeedCalibration(): void {
      machine.endDoubleFeedCalibration();
    },

    beginImageSensorCalibration(): void {
      machine.beginImageSensorCalibration();
    },

    endImageSensorCalibration(): void {
      machine.endImageSensorCalibration();
    },

    beginScannerDiagnostic(): void {
      void logger.logAsCurrentRole(LogEventId.DiagnosticInit, {
        message: `User initiated a scanner diagnostic.`,
        disposition: 'success',
      });
      return machine.beginScannerDiagnostic();
    },

    endScannerDiagnostic(): void {
      const diagnosticRecord = assertDefined(
        store.getMostRecentDiagnosticRecord('blank-sheet-scan')
      );
      void logger.logAsCurrentRole(LogEventId.DiagnosticComplete, {
        disposition:
          diagnosticRecord?.outcome === 'pass' ? 'success' : 'failure',
        message: 'Scanner diagnostic completed.',
      });
      return machine.endScannerDiagnostic();
    },

    getMostRecentScannerDiagnostic(): DiagnosticRecord | null {
      return store.getMostRecentDiagnosticRecord('blank-sheet-scan') ?? null;
    },

    async printTestPage(): Promise<PrintResult> {
      void logger.logAsCurrentRole(LogEventId.DiagnosticInit, {
        message: `User initiated a test page print.`,
        disposition: 'success',
      });
      const printResult = await printTestPage({ printer });

      // If the print failed before it completed, we log that proactively
      // rather than expecting the frontend to make a separate request.
      if (printResult.isErr()) {
        const diagnosticMessage = testPrintFailureDiagnosticMessage(
          printResult.err()
        );
        store.addDiagnosticRecord({
          type: 'test-print',
          outcome: 'fail',
          message: testPrintFailureDiagnosticMessage(printResult.err()),
        });
        void logger.logAsCurrentRole(LogEventId.DiagnosticComplete, {
          disposition: 'failure',
          message: `Test print failed. ${diagnosticMessage}`,
        });
      }

      return printResult;
    },

    logTestPrintOutcome(input: { outcome: 'pass' | 'fail' }): void {
      store.addDiagnosticRecord({
        type: 'test-print',
        outcome: input.outcome,
        message:
          input.outcome === 'pass' ? undefined : TEST_PRINT_USER_FAIL_REASON,
      });
      void logger.logAsCurrentRole(LogEventId.DiagnosticComplete, {
        disposition: input.outcome === 'pass' ? 'success' : 'failure',
        message:
          input.outcome === 'pass'
            ? 'Test print successful.'
            : `Test print failed. ${TEST_PRINT_USER_FAIL_REASON}`,
      });
    },

    getMostRecentPrinterDiagnostic(): DiagnosticRecord | null {
      return store.getMostRecentDiagnosticRecord('test-print') ?? null;
    },

    async getDiskSpaceSummary(): Promise<DiskSpaceSummary> {
      return workspace.getDiskSpaceSummary();
    },

    saveReadinessReport() {
      return saveReadinessReport({
        workspace,
        usbDrive,
        logger,
        printer,
        machine,
      });
    },

    getMostRecentAudioDiagnostic(): DiagnosticRecord | null {
      return store.getMostRecentDiagnosticRecord('scan-audio') ?? null;
    },

    getMostRecentUpsDiagnostic(): DiagnosticRecord | null {
      return (
        store.getMostRecentDiagnosticRecord('uninterruptible-power-supply') ??
        null
      );
    },

    logAudioDiagnosticOutcome(input: { outcome: DiagnosticOutcome }): void {
      store.addDiagnosticRecord({
        type: 'scan-audio',
        outcome: input.outcome,
        message:
          input.outcome === 'pass' ? undefined : TEST_AUDIO_USER_FAIL_REASON,
      });
      void logger.logAsCurrentRole(LogEventId.DiagnosticComplete, {
        disposition: input.outcome === 'pass' ? 'success' : 'failure',
        message:
          input.outcome === 'pass'
            ? 'Audio playback successful.'
            : `Audio playback failed. ${TEST_AUDIO_USER_FAIL_REASON}`,
      });
    },

    logUpsDiagnosticOutcome(input: { outcome: DiagnosticOutcome }): void {
      store.addDiagnosticRecord({
        type: 'uninterruptible-power-supply',
        outcome: input.outcome,
        message:
          input.outcome === 'pass' ? undefined : TEST_UPS_USER_FAIL_REASON,
      });
      void logger.logAsCurrentRole(LogEventId.DiagnosticComplete, {
        disposition: input.outcome === 'pass' ? 'success' : 'failure',
        message:
          input.outcome === 'pass'
            ? TEST_UPS_USER_PASS_REASON
            : TEST_UPS_USER_FAIL_REASON,
      });
    },

    async saveBallotAuditIdSecretKey(): Promise<ExportDataResult> {
      const ballotAuditIdSecretKey = store.getBallotAuditIdSecretKey();
      const exporter = new Exporter({
        usbDrive,
        allowedExportPatterns: SCAN_ALLOWED_EXPORT_PATTERNS,
      });
      const exportResult = await exporter.exportDataToUsbDrive(
        '.',
        BALLOT_AUDIT_ID_FILE_NAME,
        ballotAuditIdSecretKey
      );

      if (exportResult.isOk()) {
        await logger.logAsCurrentRole(LogEventId.FileSaved, {
          message: `User saved the ballot audit ID secret key to a USB drive.`,
          fileType: 'ballotAuditIdSecretKey',
          fileName: BALLOT_AUDIT_ID_FILE_NAME,
          disposition: 'success',
        });
      } else {
        await logger.logAsCurrentRole(LogEventId.FileSaved, {
          message: `Error while attempting to save the ballot audit ID secret key to a USB drive: ${
            exportResult.err().message
          }`,
          fileType: 'ballotAuditIdSecretKey',
          disposition: 'failure',
        });
      }

      return exportResult;
    },

    playSound(input: { name: SoundName }): Promise<void> {
      return audioPlayer.play(input.name);
    },

    ...createUiStringsApi({
      logger,
      store: workspace.store.getUiStringsStore(),
    }),

    ...createSystemCallApi({
      usbDrive,
      logger,
      machineId: getMachineConfig().machineId,
      codeVersion: getMachineConfig().codeVersion,
    }),
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp({
  audioPlayer,
  auth,
  machine,
  workspace,
  usbDrive,
  printer,
  logger,
}: {
  audioPlayer: AudioPlayer;
  auth: InsertedSmartCardAuthApi;
  machine: PrecinctScannerStateMachine;
  workspace: Workspace;
  printer: FujitsuThermalPrinterInterface;
  usbDrive: UsbDrive;
  logger: Logger;
}): Application {
  const app: Application = express();
  const api = buildApi({
    audioPlayer,
    auth,
    machine,
    workspace,
    usbDrive,
    printer,
    logger,
  });
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
