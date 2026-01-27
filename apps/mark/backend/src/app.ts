import util from 'node:util';
import express, { Application } from 'express';
import {
  generateSignedHashValidationQrCodeValue,
  InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import {
  assert,
  assertDefined,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import {
  ElectionPackageConfigurationError,
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  SystemSettings,
  DEFAULT_SYSTEM_SETTINGS,
  PollsState,
  PrecinctSelection,
  PrinterStatus,
  DiagnosticRecord,
  DiagnosticType,
  DiagnosticOutcome,
} from '@votingworks/types';
import {
  getPrecinctSelectionName,
  isElectionManagerAuth,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';

import {
  createUiStringsApi,
  readSignedElectionPackageFromUsb,
  configureUiStrings,
  createSystemCallApi,
  DiskSpaceSummary,
  ExportDataResult,
} from '@votingworks/backend';
import { LogEventId, Logger } from '@votingworks/logging';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import { Printer } from '@votingworks/printing';
import { PrintCalibration } from '@votingworks/hmpb';
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';
import { ElectionState, PrintBallotProps } from './types';
import { printBallot } from './util/print_ballot';
import {
  isAccessibleControllerAttached,
  isPatInputAttached,
} from './util/accessible_controller';
import { constructAuthMachineState } from './util/auth';
import { ElectionRecord } from './store';
import * as barcodes from './barcodes';
import { setUpBarcodeActivation } from './barcodes/activation';
import { Player as AudioPlayer, SoundName } from './audio/player';
import { saveReadinessReport } from './readiness_report';
import { printTestPage } from './util/print_test_page';

const TEST_UPS_USER_PASS_REASON = 'UPS connected and fully charged per user.';
const TEST_UPS_USER_FAIL_REASON =
  'UPS not connected or not fully charged per user.';

interface Context {
  audioPlayer?: AudioPlayer;
  auth: InsertedSmartCardAuthApi;
  barcodeClient: barcodes.BarcodeReader;
  logger: Logger;
  workspace: Workspace;
  usbDrive: UsbDrive;
  printer: Printer;
}

// Track last barcode scan for diagnostics
let lastBarcodeScanData: string | undefined;
let lastBarcodeScanTimestamp: Date | undefined;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi(ctx: Context) {
  const { auth, logger, printer, usbDrive, workspace, barcodeClient } = ctx;
  const { store } = workspace;

  // Set up barcode scan tracking for diagnostics
  barcodeClient.on('scan', (scanData: Uint8Array) => {
    lastBarcodeScanData = new TextDecoder().decode(scanData);
    lastBarcodeScanTimestamp = new Date();
  });

  return grout.createApi({
    getMachineConfig,

    getAuthStatus() {
      return auth.getAuthStatus(constructAuthMachineState(workspace));
    },

    checkPin(input: { pin: string }) {
      return auth.checkPin(constructAuthMachineState(workspace), {
        pin: input.pin,
      });
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

    getPrinterStatus(): Promise<PrinterStatus> {
      return printer.status();
    },

    getBarcodeConnected(): boolean {
      return barcodeClient.getConnectionStatus();
    },

    getMostRecentBarcodeScan(): {
      data: string;
      timestamp: Date;
    } | null {
      if (!lastBarcodeScanData || !lastBarcodeScanTimestamp) {
        return null;
      }
      return {
        data: lastBarcodeScanData,
        timestamp: lastBarcodeScanTimestamp,
      };
    },

    clearLastBarcodeScan(): void {
      lastBarcodeScanData = undefined;
      lastBarcodeScanTimestamp = undefined;
    },

    getAccessibleControllerConnected(): boolean {
      return isAccessibleControllerAttached();
    },

    getPatInputConnected(): boolean {
      return isPatInputAttached();
    },

    updateSessionExpiry(input: { sessionExpiresAt: Date }) {
      return auth.updateSessionExpiry(constructAuthMachineState(workspace), {
        sessionExpiresAt: input.sessionExpiresAt,
      });
    },

    startCardlessVoterSession(input: {
      ballotStyleId: BallotStyleId;
      precinctId: PrecinctId;
    }) {
      return auth.startCardlessVoterSession(
        constructAuthMachineState(workspace),
        {
          ballotStyleId: input.ballotStyleId,
          precinctId: input.precinctId,
        }
      );
    },

    updateCardlessVoterBallotStyle(input: { ballotStyleId: BallotStyleId }) {
      return auth.updateCardlessVoterBallotStyle({
        ballotStyleId: input.ballotStyleId,
      });
    },

    endCardlessVoterSession() {
      return auth.endCardlessVoterSession(constructAuthMachineState(workspace));
    },

    getElectionRecord(): ElectionRecord | null {
      return workspace.store.getElectionRecord() ?? null;
    },

    getSystemSettings(): SystemSettings {
      return workspace.store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
    },

    async unconfigureMachine() {
      workspace.store.reset();
      await logger.logAsCurrentRole(LogEventId.ElectionUnconfigured, {
        disposition: 'success',
        message:
          'User successfully unconfigured the machine to remove the current election.',
      });
    },

    async configureElectionPackageFromUsb(): Promise<
      Result<ElectionDefinition, ElectionPackageConfigurationError>
    > {
      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace)
      );

      const electionPackageResult = await readSignedElectionPackageFromUsb(
        authStatus,
        usbDrive,
        logger,
        { checkMarkSystemLimits: true }
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
      const { electionDefinition, systemSettings, ballots } = electionPackage;
      assert(systemSettings);

      workspace.store.withTransaction(() => {
        workspace.store.setElectionAndJurisdiction({
          electionData: electionDefinition.electionData,
          jurisdiction: authStatus.user.jurisdiction,
          electionPackageHash,
        });
        workspace.store.setSystemSettings(systemSettings);

        // Store ballot PDFs if available in the election package
        if (ballots && ballots.length > 0) {
          workspace.store.setBallots(ballots);
        }

        // automatically set precinct for single precinct elections
        if (electionDefinition.election.precincts.length === 1) {
          workspace.store.setPrecinctSelection(
            singlePrecinctSelectionFor(
              electionDefinition.election.precincts[0].id
            )
          );
        }

        configureUiStrings({
          electionPackage,
          logger,
          store: workspace.store.getUiStringsStore(),
        });
      });

      await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
        message: `Machine configured for election with hash: ${electionDefinition.ballotHash}`,
        disposition: 'success',
        ballotHash: electionDefinition.ballotHash,
      });

      return ok(electionDefinition);
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

    async printBallot(input: PrintBallotProps) {
      store.setBallotsPrintedCount(store.getBallotsPrintedCount() + 1);
      await printBallot({
        store,
        printer,
        ...input,
      });
    },

    async setPollsState(input: { pollsState: PollsState }) {
      const newPollsState = input.pollsState;
      const oldPollsState = store.getPollsState();

      store.setPollsState(newPollsState);

      assert(newPollsState !== 'polls_closed_initial');
      const logEvent = (() => {
        switch (newPollsState) {
          case 'polls_closed_final':
            return LogEventId.PollsClosed;
          case 'polls_paused':
            if (oldPollsState === 'polls_closed_final') {
              return LogEventId.ResetPollsToPaused;
            }
            return LogEventId.VotingPaused;
          case 'polls_open':
            if (oldPollsState === 'polls_closed_initial') {
              return LogEventId.PollsOpened;
            }
            return LogEventId.VotingResumed;
          /* istanbul ignore next - @preserve */
          default: {
            throwIllegalValue(newPollsState);
          }
        }
      })();

      await logger.logAsCurrentRole(logEvent, { disposition: 'success' });
    },

    setTestMode(input: { isTestMode: boolean }) {
      store.setTestMode(input.isTestMode);
      store.setPollsState('polls_closed_initial');
      store.setBallotsPrintedCount(0);
    },

    async setPrecinctSelection(input: {
      precinctSelection: PrecinctSelection;
    }): Promise<void> {
      const { electionDefinition } = assertDefined(store.getElectionRecord());
      store.setPrecinctSelection(input.precinctSelection);
      store.setBallotsPrintedCount(0);
      await logger.logAsCurrentRole(LogEventId.PrecinctConfigurationChanged, {
        disposition: 'success',
        message: `User set the precinct for the machine to ${getPrecinctSelectionName(
          electionDefinition.election.precincts,
          input.precinctSelection
        )}`,
      });
    },

    getElectionState(): ElectionState {
      return {
        precinctSelection: store.getPrecinctSelection(),
        ballotsPrintedCount: store.getBallotsPrintedCount(),
        isTestMode: store.getTestMode(),
        pollsState: store.getPollsState(),
      };
    },

    async generateSignedHashValidationQrCodeValue() {
      await logger.logAsCurrentRole(LogEventId.SignedHashValidationInit);

      try {
        const qrCodeValue = await generateSignedHashValidationQrCodeValue({
          electionRecord: store.getElectionRecord(),
          softwareVersion: getMachineConfig().codeVersion,
        });

        await logger.logAsCurrentRole(LogEventId.SignedHashValidationComplete, {
          disposition: 'success',
        });

        return qrCodeValue;
      } catch (err) {
        await logger.logAsCurrentRole(LogEventId.SignedHashValidationComplete, {
          disposition: 'failure',
          message: util.inspect(err),
        });

        throw err;
      }
    },

    getPrintCalibration(): PrintCalibration {
      return store.getPrintCalibration();
    },

    setPrintCalibration(input: PrintCalibration) {
      store.setPrintCalibration(input);
    },

    getDiskSpaceSummary(): Promise<DiskSpaceSummary> {
      return workspace.getDiskSpaceSummary();
    },

    getMostRecentDiagnostic(input: {
      diagnosticType: DiagnosticType;
    }): DiagnosticRecord | null {
      return store.getMostRecentDiagnosticRecord(input.diagnosticType) ?? null;
    },

    addDiagnosticRecord(input: Omit<DiagnosticRecord, 'timestamp'>): void {
      store.addDiagnosticRecord(input);
      void logger.logAsCurrentRole(LogEventId.DiagnosticComplete, {
        disposition: input.outcome === 'pass' ? 'success' : 'failure',
        message: `Diagnostic (${input.type}) completed with outcome: ${input.outcome}.`,
        type: input.type,
      });
    },

    async saveReadinessReport(): Promise<ExportDataResult> {
      return saveReadinessReport({
        workspace,
        usbDrive,
        logger,
        printer,
        barcodeClient,
      });
    },

    async printTestPage(): Promise<void> {
      await printTestPage({ printer, logger });
    },

    logUpsDiagnosticOutcome(input: { outcome: DiagnosticOutcome }): void {
      store.addDiagnosticRecord({
        type: 'uninterruptible-power-supply',
        outcome: input.outcome,
        message:
          input.outcome === 'pass'
            ? TEST_UPS_USER_PASS_REASON
            : TEST_UPS_USER_FAIL_REASON,
      });
      void logger.logAsCurrentRole(LogEventId.DiagnosticComplete, {
        disposition: input.outcome === 'pass' ? 'success' : 'failure',
        message:
          input.outcome === 'pass'
            ? TEST_UPS_USER_PASS_REASON
            : TEST_UPS_USER_FAIL_REASON,
        type: 'uninterruptible-power-supply',
      });
    },

    playSound(input: { name: SoundName }): Promise<void> {
      const { audioPlayer } = ctx;
      if (!audioPlayer) {
        return Promise.resolve();
      }
      return audioPlayer.play(input.name);
    },
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(ctx: Context): Application {
  const app: Application = express();
  const api = buildApi(ctx);
  app.use('/api', grout.buildRouter(api, express));

  setUpBarcodeActivation(ctx);

  return app;
}
