import util from 'node:util';
import { randomUUID as uuid } from 'node:crypto';
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
  PrinterStatus,
  DiagnosticRecord,
  DiagnosticType,
  DiagnosticOutcome,
  pollingPlaceFromElection,
  Tabulation,
} from '@votingworks/types';
import { isElectionManagerAuth } from '@votingworks/utils';

import {
  createUiStringsApi,
  readSignedElectionPackageFromDirectory,
  configureUiStrings,
  createSystemCallApi,
  ExportDataResult,
} from '@votingworks/backend';
import { LogEventId, Logger } from '@votingworks/logging';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import { PrintSides, Printer, renderToPdf } from '@votingworks/printing';
import { PrintCalibration } from '@votingworks/hmpb';
import {
  createSummaryBallotTestDeck,
  generateTestDeckBallots,
  generateTestDeckCastVoteRecords,
  getTallyReportResults,
} from '@votingworks/test-decks';
import { AdminTallyReportByParty } from '@votingworks/ui';
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';
import {
  ElectionState,
  PrintBallotProps,
  PrintBlankBallotProps,
} from './types';
import { printBallot, printBlankBallot } from './util/print_ballot';
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
import { getCurrentTime } from './util/get_current_time';

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

interface TestDeckError {
  type: 'no_test_deck_generated';
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
      isM404nSupportRequired: true,
    });
  }

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

        if (electionDefinition.election.pollingPlaces?.length === 1) {
          workspace.store.setPollingPlaceId(
            electionDefinition.election.pollingPlaces[0].id
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
      workspacePath: workspace.path,
      getAuthStatus: /* istanbul ignore next */ () =>
        auth.getAuthStatus(constructAuthMachineState(workspace)),
    }),

    async printBallot(input: PrintBallotProps) {
      await printBallot({
        store,
        printer,
        ...input,
      });
      store.setBallotsPrintedCount(store.getBallotsPrintedCount() + 1);
    },

    async printBlankBallot(input: PrintBlankBallotProps) {
      const systemSettings =
        store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
      assert(
        systemSettings.allowPrintingBlankBallotsFromVxMark,
        'Printing blank ballots from VxMark is not enabled'
      );
      await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
        message: 'Printing a blank ballot',
        ballotStyleId: input.ballotStyleId,
        precinctId: input.precinctId,
      });
      await printBlankBallot({
        store,
        printer,
        ...input,
      });
      store.setBallotsPrintedCount(store.getBallotsPrintedCount() + 1);
      await logger.logAsCurrentRole(LogEventId.PrinterPrintComplete, {
        message: 'Blank ballot printed',
        disposition: 'success',
        ballotStyleId: input.ballotStyleId,
        precinctId: input.precinctId,
      });
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
          isM404nSupportRequired: true,
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
        /* istanbul ignore next */
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
            /* istanbul ignore next */
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

    setPollingPlaceId(input: { id: string }): void {
      const { electionDefinition } = assertDefined(
        store.getElectionRecord(),
        'Cannot set polling place without an election.'
      );

      const { election } = electionDefinition;
      const { name } = pollingPlaceFromElection(election, input.id);

      store.setPollingPlaceId(input.id);
      store.setBallotsPrintedCount(0);

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

export function buildApp(ctx: Context): Application {
  const app: Application = express();
  const api = buildApi(ctx);
  app.use('/api', grout.buildRouter(api, express));

  setUpBarcodeActivation(ctx);

  return app;
}
