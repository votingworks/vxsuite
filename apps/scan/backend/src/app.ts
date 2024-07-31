import * as grout from '@votingworks/grout';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  ElectionPackageConfigurationError,
  DEFAULT_SYSTEM_SETTINGS,
  PrecinctSelection,
  SinglePrecinctSelection,
  DiagnosticRecord,
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
} from '@votingworks/backend';
import { assert, assertDefined, ok, Result } from '@votingworks/basics';
import { InsertedSmartCardAuthApi, LiveCheck } from '@votingworks/auth';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import {
  FujitsuPrintResult,
  Printer,
  PrinterStatus,
  PrintResult,
} from './printing/printer';
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
import { printFullReport } from './printing/print_full_report';
import { printReportSection } from './printing/print_report_section';
import {
  TEST_PRINT_USER_FAIL_REASON,
  testPrintFailureDiagnosticMessage,
} from './util/diagnostics';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi({
  auth,
  machine,
  workspace,
  usbDrive,
  printer,
  logger,
}: {
  auth: InsertedSmartCardAuthApi;
  machine: PrecinctScannerStateMachine;
  workspace: Workspace;
  usbDrive: UsbDrive;
  printer: Printer;
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

    generateLiveCheckQrCodeValue() {
      const { machineId } = getMachineConfig();
      const electionRecord = workspace.store.getElectionRecord();
      return new LiveCheck().generateQrCodeValue({
        machineId,
        ballotHash: electionRecord?.electionDefinition.ballotHash,
      });
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

      store.withTransaction(() => {
        store.setElectionAndJurisdiction({
          electionData: electionDefinition.electionData,
          jurisdiction: authStatus.user.jurisdiction,
          electionPackageHash,
        });
        if (precinctSelection) {
          store.setPrecinctSelection(precinctSelection);
        }
        store.setSystemSettings(systemSettings);

        configureUiStrings({
          electionPackage,
          logger,
          noAudio: true,
          store: workspace.store.getUiStringsStore(),
        });
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
        ballotCountWhenBallotBagLastReplaced:
          store.getBallotCountWhenBallotBagLastReplaced(),
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

    unconfigureElection(): void {
      workspace.reset();
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

    setIsSoundMuted(input: { isSoundMuted: boolean }): void {
      store.setIsSoundMuted(input.isSoundMuted);
    },

    setIsDoubleFeedDetectionDisabled(input: {
      isDoubleFeedDetectionDisabled: boolean;
    }): void {
      store.setIsDoubleFeedDetectionDisabled(
        input.isDoubleFeedDetectionDisabled
      );
    },

    async setTestMode(input: { isTestMode: boolean }): Promise<void> {
      // Use the continuous export mutex to ensure that any pending continuous export operations
      // finish first
      await workspace.continuousExportMutex.withLock(() =>
        workspace.resetElectionSession()
      );
      store.setTestMode(input.isTestMode);
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
      await logger.logAsCurrentRole(LogEventId.BallotBagReplaced, {
        disposition: 'success',
        message: 'The user confirmed that they replaced the ballot bag.',
      });
    },

    async exportCastVoteRecordsToUsbDrive(): Promise<ExportCastVoteRecordsToUsbDriveResult> {
      return exportCastVoteRecordsToUsbDrive({
        mode: 'full_export',
        workspace,
        usbDrive,
        logger,
      });
    },

    getPrinterStatus(): Promise<PrinterStatus> {
      return printer.getStatus();
    },

    /**
     * If the printer is a V3 hardware printer (standard CUPS printer) then
     * this will print the entire report. If the printer is a V4 hardware
     * printer (embedded Fujitsu thermal roll printer) then this will print the
     * first section of the report only.
     */
    async printReport(): Promise<PrintResult> {
      if (printer.scheme === 'hardware-v3') {
        return {
          scheme: 'hardware-v3',
          pageCount: await printFullReport({ store, printer }),
        };
      }

      return {
        scheme: 'hardware-v4',
        result: await printReportSection({ store, printer, index: 0 }),
      };
    },

    /**
     * Prints a specific section of the report, e.g. for a particular party.
     * This is only used for V4 hardware printers (roll printer).
     */
    async printReportSection(input: {
      index: number;
    }): Promise<FujitsuPrintResult> {
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

    beginDoubleFeedCalibration(): void {
      machine.beginDoubleFeedCalibration();
    },

    endDoubleFeedCalibration(): void {
      machine.endDoubleFeedCalibration();
    },

    async printTestPage(): Promise<FujitsuPrintResult> {
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

    ...createUiStringsApi({
      logger,
      store: workspace.store.getUiStringsStore(),
    }),

    ...createSystemCallApi({
      usbDrive,
      logger,
      machineId: getMachineConfig().machineId,
    }),
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp({
  auth,
  machine,
  workspace,
  usbDrive,
  printer,
  logger,
}: {
  auth: InsertedSmartCardAuthApi;
  machine: PrecinctScannerStateMachine;
  workspace: Workspace;
  printer: Printer;
  usbDrive: UsbDrive;
  logger: Logger;
}): Application {
  const app: Application = express();
  const api = buildApi({ auth, machine, workspace, usbDrive, printer, logger });
  app.use('/api', grout.buildRouter(api, express));
  useDevDockRouter(app, express, 'scan');
  return app;
}
