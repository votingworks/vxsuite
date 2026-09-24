import util from 'node:util';
import { randomUUID as uuid } from 'node:crypto';
import express, { type Application } from 'express';
import {
  generateSignedHashValidationQrCodeValue,
  type InsertedSmartCardAuthApi,
} from '@votingworks/auth';
import {
  assert,
  assertDefined,
  ok,
  type Result,
  throwIllegalValue,
} from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import {
  type ElectionPackageConfigurationError,
  type BallotStyleId,
  type ElectionDefinition,
  type PrecinctId,
  type SystemSettings,
  DEFAULT_SYSTEM_SETTINGS,
  type PollsState,
  type PrinterStatus,
  type PrintJobId,
  type PrintJobStatus,
  type DiagnosticRecord,
  type DiagnosticType,
  type DiagnosticOutcome,
  pollingPlaceFromElection,
  type Tabulation,
  type InsertedSmartCardAuth,
} from '@votingworks/types';
import { isElectionManagerAuth } from '@votingworks/utils';

import {
  createUiStringsApi,
  readSignedElectionPackageFromDirectory,
  configureUiStrings,
  createSystemCallApi,
  type ExportDataResult,
  configureUiStringAudioClipsStreaming,
  streamElectionPackageBallots,
  withElectionPackageZip,
} from '@votingworks/backend';
import { LogEventId, type Logger } from '@votingworks/logging';
import type { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import {
  PrintSides,
  type Printer,
  renderToPdf,
  awaitJobSettlement,
} from '@votingworks/printing';
import type { PrintCalibration } from '@votingworks/hmpb';
import {
  createSummaryBallotTestDeck,
  generateTestDeckBallots,
  generateTestDeckCastVoteRecords,
  getTallyReportResults,
} from '@votingworks/test-decks';
import { AdminTallyReportByParty } from '@votingworks/ui';
import { getMachineConfig } from './machine_config.js';
import type { Workspace } from './util/workspace.js';
import type {
  ElectionState,
  PrintBallotProps,
  PrintBlankBallotProps,
} from './types.js';
import { printBallot, printBlankBallot } from './util/print_ballot.js';
import {
  isAccessibleControllerAttached,
  isPatInputAttached,
} from './util/accessible_controller.js';
import { constructAuthMachineState } from './util/auth.js';
import type { ElectionRecord, Store } from './store.js';
import type * as barcodes from './barcodes/index.js';
import { setUpBarcodeActivation } from './barcodes/activation.js';
import type { AudioPlayerInterface, SoundName } from './audio/player.js';
import { saveReadinessReport } from './readiness_report.js';
import { printTestPage } from './util/print_test_page.js';
import { getCurrentTime } from './util/get_current_time.js';

const TEST_UPS_USER_PASS_REASON = 'UPS connected and fully charged per user.';
const TEST_UPS_USER_FAIL_REASON =
  'UPS not connected or not fully charged per user.';

export interface Context {
  audioPlayer?: AudioPlayerInterface;
  auth: InsertedSmartCardAuthApi;
  barcodeClient: barcodes.BarcodeReader;
  logger: Logger;
  workspace: Workspace;
  usbDrive: UsbDrive;
  printer: Printer;
}

interface TestDeckError {
  type: 'no_test_deck_generated';
}

// Track last barcode scan for diagnostics
let lastBarcodeScanData: string | undefined;
let lastBarcodeScanTimestamp: Date | undefined;

/**
 * Whether the machine can be put into test mode. Test mode requires test mode
 * ballot PDFs only for flows that print from the pre-rendered ballots in the
 * election package: `bubble_ballot` printing and blank ballot printing. In
 * those flows, entering test mode without test ballots present would fail at
 * print time, so test mode is unavailable. Other print modes render ballots on
 * the fly and don't need pre-rendered test ballots.
 *
 */
function isTestModeAvailable(store: Store): boolean {
  const systemSettings = store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
  const requiresPreRenderedTestBallots =
    systemSettings.bmdPrintMode === 'bubble_ballot' ||
    systemSettings.allowPrintingBlankBallotsFromVxMark;
  return !requiresPreRenderedTestBallots || store.hasTestBallots();
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi(ctx: Context) {
  const { auth, logger, printer, usbDrive, workspace, barcodeClient } = ctx;
  const { store } = workspace;

  // Bumped whenever the printed ballot count is reset
  // e.g. by switching ballot casting mode. This prevents the following:
  // 1. Test ballot print job is started
  // 2. Pollworker switches ballot casting mode while print job is in flight
  // 3. Print job finishes and increments official ballot mode print count
  let ballotPrintingGeneration = 0;

  function countPrintedBallot(generation: number): void {
    if (generation === ballotPrintingGeneration) {
      store.setBallotsPrintedCount(store.getBallotsPrintedCount() + 1);
    }
  }

  function resetBallotsPrintedCount(): void {
    ballotPrintingGeneration += 1;
    store.setBallotsPrintedCount(0);
  }

  // Set up barcode scan tracking for diagnostics
  barcodeClient.on('scan', (scanData: Uint8Array) => {
    lastBarcodeScanData = new TextDecoder().decode(scanData);
    lastBarcodeScanTimestamp = new Date();
  });

  async function printTestDeckTallyReport(
    electionDefinition: ElectionDefinition,
    allCvrs: Tabulation.CastVoteRecord[],
    /** Print for the specified precinct or overall if undefined */
    precinctId?: PrecinctId
  ): Promise<void> {
    const { election } = electionDefinition;
    const cvrs = precinctId
      ? allCvrs.filter((cvr) => cvr.precinctId === precinctId)
      : allCvrs;
    const tallyReportResults = await getTallyReportResults(
      election,
      cvrs,
      precinctId
    );
    const precinctName = precinctId
      ? election.precincts.find((p) => p.id === precinctId)?.name
      : undefined;
    const tallyReportPdf = (
      await renderToPdf({
        document: AdminTallyReportByParty({
          electionDefinition,
          title: precinctName,
          isOfficial: false,
          isTest: true,
          isForLogicAndAccuracyTesting: true,
          testId: 'vxmark-test-deck-tally-report',
          tallyReportResults,
          generatedAtTime: new Date(getCurrentTime()),
        }),
      })
    ).unsafeUnwrap();
    await printer.print({
      data: tallyReportPdf,
      sides: PrintSides.OneSided,
    });
  }

  const systemCallApi = createSystemCallApi({
    usbDrive,
    logger,
    machineId: getMachineConfig().machineId,
    codeVersion: getMachineConfig().codeVersion,
    workspacePath: workspace.path,
    getAuthStatus: /* @coverage-exclude */ () =>
      auth.getAuthStatus(constructAuthMachineState(workspace)),
  });

  function endCardlessVoterSessionIfAny() {
    auth.endCardlessVoterSession(constructAuthMachineState(workspace));
  }

  return grout.createApi({
    getMachineConfig,

    getAuthStatus(): Promise<InsertedSmartCardAuth.AuthStatus> {
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

    getPrintJobStatus(input: {
      jobId: PrintJobId;
    }): Result<PrintJobStatus, Error> {
      return printer.getJobStatus(input.jobId);
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
      endCardlessVoterSessionIfAny();
    },

    getElectionRecord(): ElectionRecord | null {
      return workspace.store.getElectionRecord() ?? null;
    },

    getSystemSettings(): SystemSettings {
      return workspace.store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
    },

    async unconfigureMachine() {
      endCardlessVoterSessionIfAny();
      workspace.store.reset();
      // Re-enable USB ports in case they were auto-disabled while an alarm was
      // active (see setup_printer_page). Otherwise they remain silently
      // disabled, preventing the machine from recognizing a new election
      // package.
      const { enabled } = await systemCallApi.getUsbPortStatus();
      if (!enabled) {
        await systemCallApi.toggleUsbPorts({ action: 'enable' });
      }
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

      const usbDriveStatus = await usbDrive.status();
      assert(usbDriveStatus.status === 'mounted', 'No USB drive mounted');
      const electionPackageResult =
        await readSignedElectionPackageFromDirectory(
          authStatus,
          usbDriveStatus.mountpoint,
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
      const { electionPackage, electionPackageHash, filePath } =
        electionPackageResult.ok();
      const { electionDefinition, systemSettings } = electionPackage;
      assert(systemSettings);

      // Ballots and audio clips are both streamed from the package, so open it
      // once and stream both entries over the same open file.
      await withElectionPackageZip(filePath, async (zip) => {
        // [TODO] Cancel the transaction if the user logs out while configuring,
        // since large packages can take a while to import.
        await workspace.store.withTransaction(async () => {
          workspace.store.setElectionAndJurisdiction({
            electionData: electionDefinition.electionData,
            jurisdiction: authStatus.user.jurisdiction,
            electionPackageHash,
            ballotHash: electionDefinition.ballotHash,
          });
          workspace.store.setSystemSettings(systemSettings);

          for await (const ballot of streamElectionPackageBallots(zip)) {
            store.addBallot(ballot);
          }

          // The machine defaults to test mode, but if test mode isn't available
          // for this election package (no test ballots for a print flow that
          // needs them), start in official mode to avoid footgun of allowing
          // users to try to print test mode ballots that don't exist.
          if (!isTestModeAvailable(workspace.store)) {
            workspace.store.setTestMode(false);
          }

          if (electionDefinition.election.pollingPlaces?.length === 1) {
            workspace.store.setPollingPlaceId(
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              electionDefinition.election.pollingPlaces[0]!.id
            );
          }

          configureUiStrings({
            electionPackage,
            logger,
            store: workspace.store.getUiStringsStore(),
          });

          await configureUiStringAudioClipsStreaming({
            zip,
            store: store.getUiStringsStore(),
          });
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

    ...systemCallApi,

    async printBallot(input: PrintBallotProps): Promise<PrintJobId> {
      await logger.logAsCurrentRole(LogEventId.BallotPrintRequest, {
        message: 'Printing a ballot',
        ballotStyleId: input.ballotStyleId,
        precinctId: input.precinctId,
      });
      const generation = ballotPrintingGeneration;
      const jobId = await printBallot({
        store,
        printer,
        ...input,
      });
      awaitJobSettlement({
        jobId,
        printer,
        onSettled: async (status) => {
          const sentToPrinter = status.outcome === 'sent-to-printer';
          if (sentToPrinter) {
            countPrintedBallot(generation);
          }
          await logger.logAsCurrentRole(LogEventId.BallotPrintComplete, {
            message: sentToPrinter
              ? 'Ballot printed'
              : 'Ballot failed to print',
            disposition: sentToPrinter ? 'success' : 'failure',
            ballotStyleId: input.ballotStyleId,
            precinctId: input.precinctId,
            ...(status.reason ? { reason: status.reason } : {}),
          });
        },
      });
      return jobId;
    },

    async printBlankBallot(input: PrintBlankBallotProps): Promise<PrintJobId> {
      const systemSettings =
        // @coverage-defer
        store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
      assert(
        systemSettings.allowPrintingBlankBallotsFromVxMark,
        'Printing blank ballots from VxMark is not enabled'
      );
      await logger.logAsCurrentRole(LogEventId.BallotPrintRequest, {
        message: 'Printing a blank ballot',
        ballotStyleId: input.ballotStyleId,
        precinctId: input.precinctId,
      });
      const generation = ballotPrintingGeneration;
      const jobId = await printBlankBallot({
        store,
        printer,
        ...input,
      });
      awaitJobSettlement({
        jobId,
        printer,
        onSettled: async (status) => {
          const sentToPrinter = status.outcome === 'sent-to-printer';
          if (sentToPrinter) {
            countPrintedBallot(generation);
          }
          await logger.logAsCurrentRole(LogEventId.BallotPrintComplete, {
            message: sentToPrinter
              ? 'Blank ballot printed'
              : 'Blank ballot failed to print',
            disposition: sentToPrinter ? 'success' : 'failure',
            ballotStyleId: input.ballotStyleId,
            precinctId: input.precinctId,
            ...(status.reason ? { reason: status.reason } : {}),
          });
        },
      });
      return jobId;
    },

    async printTestDeck({
      precinctId,
    }: {
      /** Print for the specified precinct or overall if undefined */
      precinctId?: PrecinctId;
    }): Promise<void> {
      const { electionDefinition } = assertDefined(store.getElectionRecord());
      const { election } = electionDefinition;
      await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
        message: 'Attempting to print summary ballot test deck',
        precinct: precinctId || 'all',
      });

      try {
        const ballotSpecs = generateTestDeckBallots({
          election,
          precinctId,
          ballotFormat: 'summary',
        });
        const deckPdf = await createSummaryBallotTestDeck({
          electionDefinition,
          ballotSpecs,
          isLiveMode: false,
          generateBallotAuditId: () => uuid(),
        });

        if (!deckPdf) {
          await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
            message: 'No test deck PDF was generated',
            disposition: 'failure',
          });
          const err: TestDeckError = { type: 'no_test_deck_generated' };
          throw err;
        }

        await printer.print({
          data: deckPdf,
          sides: PrintSides.OneSided,
        });

        const allCvrs = generateTestDeckCastVoteRecords(election, {
          includeSummaryBallots: true,
          includeBubbleBallots: false,
        });

        const reportPrecinctIds = precinctId
          ? [precinctId]
          : [undefined, ...election.precincts.map((p) => p.id)];
        for (const reportPrecinctId of reportPrecinctIds) {
          await printTestDeckTallyReport(
            electionDefinition,
            allCvrs,
            reportPrecinctId
          );
        }

        await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
          message: 'Printed summary ballot test deck',
          disposition: 'success',
          ballotCount: ballotSpecs.length,
        });
      } catch (error) {
        // @coverage-exclude
        await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
          message: 'Error printing summary ballot test deck',
          disposition: 'failure',
          errorDetails: error instanceof Error ? error.message : String(error),
        });

        throw error;
      }
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
          default: {
            throwIllegalValue(newPollsState);
          }
        }
      })();

      await logger.logAsCurrentRole(logEvent, { disposition: 'success' });
    },

    setTestMode(input: { isTestMode: boolean }) {
      endCardlessVoterSessionIfAny();
      store.setTestMode(input.isTestMode);
      store.setPollsState('polls_closed_initial');
      resetBallotsPrintedCount();
    },

    setPollingPlaceId(input: { id: string }): void {
      const { electionDefinition } = assertDefined(
        store.getElectionRecord(),
        'Cannot set polling place without an election.'
      );

      const { election } = electionDefinition;
      const { name } = pollingPlaceFromElection(election, input.id);

      endCardlessVoterSessionIfAny();
      store.setPollingPlaceId(input.id);
      resetBallotsPrintedCount();

      void logger.logAsCurrentRole(LogEventId.PollingPlaceChanged, {
        disposition: 'success',
        message: `User set the polling place for the machine to ${name}`,
      });
    },

    getElectionState(): ElectionState {
      return {
        pollingPlaceId: store.getPollingPlaceId(),
        ballotsPrintedCount: store.getBallotsPrintedCount(),
        isTestMode: store.getTestMode(),
        isTestModeAvailable: isTestModeAvailable(store),
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

export function buildApp(ctx: Context, api = buildApi(ctx)): Application {
  const app: Application = express();
  app.use('/api', grout.buildRouter(api, express));

  setUpBarcodeActivation(ctx);

  return app;
}
