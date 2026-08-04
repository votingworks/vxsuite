import * as grout from '@votingworks/grout';
import { Buffer } from 'node:buffer';
import express, { Application } from 'express';
import { assert, assertDefined, err, ok, Result } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import {
  ballotPaperDimensions,
  DiagnosticRecord,
  ElectionDefinition,
  ElectionPackageConfigurationError,
  LanguageCode,
  Id,
  BallotType,
  BallotPrintCount,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  pollingPlaceFromElection,
  PrecinctId,
  Election,
  Tabulation,
} from '@votingworks/types';
import {
  createSystemCallApi,
  ElectionRecord,
  ExportDataResult,
  getBatteryInfo,
  readSignedElectionPackageFromDirectory,
  streamElectionPackageBallots,
  withElectionPackageZip,
} from '@votingworks/backend';
import {
  electionHasBallotPositions,
  isElectionManagerAuth,
} from '@votingworks/utils';
import {
  generateTestDeckBallots,
  generateTestDeckCastVoteRecords,
  getTallyReportResults,
  TestDeckBallot,
} from '@votingworks/test-decks';
import { generateSignedHashValidationQrCodeValue } from '@votingworks/auth';
import {
  cleanupCachedBrowser,
  PrintProps,
  PrintSides,
  renderToPdf,
} from '@votingworks/printing';
import { AdminTallyReportByParty } from '@votingworks/ui';
import { generateMarkOverlay } from '@votingworks/hmpb';
import { AppContext } from './context';
import { constructAuthMachineState } from './util/auth';
import {
  printBallotsPrintedReport,
  exportBallotsPrintedReportPdf,
} from './reports/ballots_printed_report';
import { printTestPage } from './printing/test_print';
import { saveReadinessReport } from './reports/readiness';
import { BallotPrintEntry, DeviceStatuses } from './types';
import { getMachineConfig } from './machine_config';
import { findBallotStyleId } from './util/ballot_styles';
import { getCurrentTime } from './util/get_current_time';

interface TestDeckBallotToPrint {
  spec: TestDeckBallot;
  ballot: BallotPrintEntry;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi(ctx: AppContext) {
  const { auth, usbDrive, logger, workspace, printer } = ctx;
  const { store } = workspace;

  function printBallots(
    electionDefinition: ElectionDefinition,
    options: PrintProps
  ) {
    return printer.print({
      ...options,
      size: electionDefinition.election.ballotLayout.paperSize,
      sides: PrintSides.TwoSidedLongEdge,
    });
  }

  // Generates the test deck ballot specs for the given precincts and keeps only
  // those that have a corresponding ballot in the store.
  function getTestDeckBallotsToPrint(
    election: Election,
    precinctIds: PrecinctId[]
  ): TestDeckBallotToPrint[] {
    return precinctIds
      .flatMap((precinctId) =>
        generateTestDeckBallots({
          election,
          precinctId,
          ballotFormat: 'bubble',
        })
      )
      .map((spec) => ({
        spec,
        ballot: store.getBallot({
          ballotStyleId: spec.ballotStyleId,
          precinctId: spec.precinctId,
          ballotType: BallotType.Precinct,
          ballotMode: 'test',
        }),
      }))
      .filter((entry): entry is TestDeckBallotToPrint => entry.ballot !== null);
  }

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
          testId: 'vxprint-test-deck-tally-report',
          tallyReportResults,
          generatedAtTime: new Date(getCurrentTime()),
        }),
        paperDimensions: ballotPaperDimensions(election.ballotLayout.paperSize),
      })
    ).unsafeUnwrap();
    await printBallots(electionDefinition, {
      data: Buffer.from(tallyReportPdf),
      copies: 1,
    });
  }

  const methods = {
    getMachineConfig,

    getAuthStatus() {
      return auth.getAuthStatus(constructAuthMachineState(store));
    },

    checkPin(input: { pin: string }) {
      return auth.checkPin(constructAuthMachineState(store), input);
    },

    logOut() {
      return auth.logOut(constructAuthMachineState(store));
    },

    updateSessionExpiry(input: { sessionExpiresAt: Date }) {
      return auth.updateSessionExpiry(constructAuthMachineState(store), input);
    },

    async configureElectionPackageFromUsb(): Promise<
      Result<ElectionDefinition, ElectionPackageConfigurationError>
    > {
      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace.store)
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

      // Stream the serialized ballots (potentially GBs) into the store in
      // batches rather than holding them all in memory. The ballots table is
      // independent of the election record, so a failed or empty import is
      // cleaned up here without ever leaving the machine configured.
      store.deleteBallots();
      let ballotCount = 0;
      try {
        await withElectionPackageZip(filePath, async (electionPackageZip) => {
          for await (const ballots of streamElectionPackageBallots(
            electionPackageZip
          )) {
            store.addBallots(ballots);
            ballotCount += ballots.length;
          }
        });
      } catch (error) {
        store.deleteBallots();
        throw error;
      }
      if (ballotCount === 0) {
        const noBallotsError: ElectionPackageConfigurationError = {
          type: 'no_ballots',
        };
        await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
          disposition: 'failure',
          message: 'Error configuring machine.',
          errorDetails: JSON.stringify(noBallotsError),
        });
        return err(noBallotsError);
      }

      store.withTransaction(() => {
        store.setElectionAndJurisdiction({
          electionData: electionDefinition.electionData,
          jurisdiction: authStatus.user.jurisdiction,
          electionPackageHash,
        });
        store.setSystemSettings(systemSettings);

        if (electionDefinition.election.pollingPlaces?.length === 1) {
          workspace.store.setPollingPlaceId(
            electionDefinition.election.pollingPlaces[0].id
          );
        }
      });

      await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
        message: `Machine configured for election with hash: ${electionDefinition.ballotHash}`,
        disposition: 'success',
        ballotHash: electionDefinition.ballotHash,
      });

      return ok(electionDefinition);
    },

    getElectionRecord(): ElectionRecord | null {
      return store.getElectionRecord() || null;
    },

    getSystemSettings(): SystemSettings {
      return store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
    },

    getPollingPlaceId(): string | null {
      return store.getPollingPlaceId() || null;
    },

    setPollingPlaceId(input: { id: string }): void {
      const { electionDefinition } = assertDefined(
        store.getElectionRecord(),
        'Cannot set polling place without an election.'
      );

      const { election } = electionDefinition;
      const { name } = pollingPlaceFromElection(election, input.id);

      store.setPollingPlaceId(input.id);

      void logger.logAsCurrentRole(LogEventId.PollingPlaceChanged, {
        disposition: 'success',
        message: `User set the polling place for the machine to ${name}`,
      });
    },

    getTestMode(): boolean {
      return store.getTestMode();
    },

    /**
     * Whether the election package contains test mode ballot PDFs. Every ballot
     * VxPrint prints (including test decks, which are always test mode) comes
     * from a pre-rendered PDF in the election package, so without test ballots
     * neither test ballot mode nor test deck printing are possible.
     */
    hasTestBallots(): boolean {
      return store.hasTestBallots();
    },

    async setTestMode(input: { testMode: boolean }): Promise<void> {
      const { testMode } = input;
      // Frontend should prevent this but we assert as a failsafe
      assert(
        !testMode || store.hasTestBallots(),
        'Cannot switch to test ballot mode: the election package does not contain test ballots.'
      );
      await logger.logAsCurrentRole(LogEventId.TogglingTestMode, {
        message: `Toggling to ${testMode ? 'Test' : 'Official'} Ballot Mode...`,
      });
      store.withTransaction(() => {
        store.resetBallotPrintCounts();
        store.setTestMode(testMode);
      });
      await logger.logAsCurrentRole(LogEventId.ToggledTestMode, {
        disposition: 'success',
        message: `Successfully toggled to ${
          testMode ? 'Test' : 'Official'
        } Ballot Mode`,
      });
    },

    unconfigureMachine(): void {
      store.reset();
      void logger.logAsCurrentRole(LogEventId.ElectionUnconfigured, {
        disposition: 'success',
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
        auth.getAuthStatus(constructAuthMachineState(workspace.store)),
    }),

    getBallots(input: {
      ballotType?: BallotType;
      languageCode?: LanguageCode;
    }): BallotPrintEntry[] {
      const isTestMode = store.getTestMode();
      const ballotMode = isTestMode ? 'test' : 'official';

      return store.getBallots({
        ballotMode,
        ...input,
      });
    },

    getBallotPrintCounts(): BallotPrintCount[] {
      const isTestMode = store.getTestMode();
      const ballotMode = isTestMode ? 'test' : 'official';
      return store.getBallotPrintCounts({ ballotMode });
    },

    getDistinctBallotStylesCount(input: {
      ballotType: BallotType;
      languageCode: LanguageCode;
    }): number {
      const isTestMode = store.getTestMode();
      const ballotMode = isTestMode ? 'test' : 'official';

      return store.getDistinctBallotStylesCount({ ballotMode, ...input });
    },

    async printBallot(input: {
      precinctId: Id;
      splitId?: Id;
      partyId?: Id;
      languageCode: LanguageCode;
      ballotType: BallotType;
      copies: number;
    }) {
      const { electionDefinition } = assertDefined(store.getElectionRecord());
      const printerStatus = await printer.status();
      await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
        message: `Attempting to print ballot with ${input.copies} copies`,
        ballotProps: JSON.stringify({
          precinctId: input.precinctId,
          splitId: input.splitId,
          partyId: input.partyId,
          languageCode: input.languageCode,
          ballotType: input.ballotType,
        }),
        printConnected: printerStatus.connected,
      });

      const ballotStyleId = findBallotStyleId(electionDefinition.election, {
        precinctId: input.precinctId,
        splitId: input.splitId,
        languageCode: input.languageCode,
        partyId: input.partyId,
      });

      const isTestMode = store.getTestMode();
      const ballotMode = isTestMode ? 'test' : 'official';

      const ballot = assertDefined(
        store.getBallot({
          ballotStyleId,
          precinctId: input.precinctId,
          ballotType: input.ballotType,
          ballotMode,
        })
      );

      await printBallots(electionDefinition, {
        data: Buffer.from(ballot.encodedBallot, 'base64'),
        copies: input.copies,
      });

      store.incrementBallotPrintCount({
        precinctId: input.precinctId,
        ballotStyleId,
        ballotType: input.ballotType,
        ballotMode,
        count: input.copies,
      });

      await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
        message: `Printed ${ballotMode} ballot ${ballotStyleId} with ${input.copies} copies`,
        ballotProps: JSON.stringify({
          ballotStyleId,
          precinctId: input.precinctId,
          splitId: input.splitId,
          partyId: input.partyId,
          languageCode: input.languageCode,
          ballotType: input.ballotType,
          ballotMode,
        }),
        disposition: 'success',
      });
    },

    async printAllBallotStyles(input: {
      languageCode: LanguageCode;
      ballotType: BallotType;
      copiesPerStyle: number;
    }): Promise<void> {
      const { electionDefinition } = assertDefined(store.getElectionRecord());
      const printerStatus = await printer.status();
      await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
        message: `Attempting to print all ballot styles with ${input.copiesPerStyle} copies`,
        ballotProps: JSON.stringify({
          languageCode: input.languageCode,
          ballotType: input.ballotType,
        }),
        printConnected: printerStatus.connected,
      });

      const isTestMode = store.getTestMode();
      /* istanbul ignore next */
      const ballotMode = isTestMode ? 'test' : 'official';

      // BallotPrintCounts are hydrated with precinct/split names
      // and part names, so we use them to get the sorted order
      const ballotOrder = new Map<string, number>();
      const sortedPrintCounts = store
        .getBallotPrintCounts({
          ballotMode,
        })
        .sort((printCountA, printCountB) => {
          if (
            printCountA.precinctOrSplitName !== printCountB.precinctOrSplitName
          ) {
            return printCountA.precinctOrSplitName.localeCompare(
              printCountB.precinctOrSplitName
            );
          }
          if (printCountA.partyName) {
            return printCountA.partyName.localeCompare(
              assertDefined(printCountB.partyName)
            );
          }
          /* istanbul ignore next */
          return 0;
        });
      for (let i = 0; i < sortedPrintCounts.length; i += 1) {
        const printCount = sortedPrintCounts[i];
        const key = `${printCount.precinctId}-${printCount.ballotStyleId}`;
        ballotOrder.set(key, i);
      }

      const ballots = store
        .getBallots({
          ballotMode,
          languageCode: input.languageCode,
          ballotType: input.ballotType,
        })
        // Sort using the names from ballotPrintCounts for consistency
        .sort(
          (a, b) =>
            assertDefined(
              ballotOrder.get(`${a.precinctId}-${a.ballotStyleId}`)
            ) -
            assertDefined(ballotOrder.get(`${b.precinctId}-${b.ballotStyleId}`))
        );

      let totalPrintCount = 0;
      for (const ballot of ballots) {
        await printBallots(electionDefinition, {
          data: Buffer.from(ballot.encodedBallot, 'base64'),
          copies: input.copiesPerStyle,
        });
        totalPrintCount += input.copiesPerStyle;
        store.incrementBallotPrintCount({
          precinctId: ballot.precinctId,
          ballotStyleId: ballot.ballotStyleId,
          ballotType: input.ballotType,
          ballotMode,
          count: input.copiesPerStyle,
        });
      }

      await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
        message: `Printed all ballot styles with ${input.copiesPerStyle} copies – ${totalPrintCount} ballots printed`,
        requestProps: JSON.stringify({
          languageCode: input.languageCode,
          ballotType: input.ballotType,
          copiesPerStyle: input.copiesPerStyle,
        }),
        disposition: 'success',
      });
    },

    async printBallotsPrintedReport(): Promise<void> {
      await printBallotsPrintedReport({
        printer,
        logger,
        store,
      });
    },

    async exportBallotsPrintedReportPdf(): Promise<void> {
      await exportBallotsPrintedReportPdf({
        usbDrive,
        logger,
        store,
      });
    },

    async getDeviceStatuses(): Promise<DeviceStatuses> {
      const [usbDriveStatus, printerStatus, batteryStatus] = await Promise.all([
        usbDrive.status(),
        printer.status(),
        getBatteryInfo({ logger }),
      ]);
      return {
        usbDrive: usbDriveStatus,
        printer: printerStatus,
        /* istanbul ignore next */
        battery: batteryStatus ?? undefined,
      };
    },

    async ejectUsbDrive(): Promise<void> {
      await usbDrive.eject();
    },

    addDiagnosticRecord(input: Omit<DiagnosticRecord, 'timestamp'>): void {
      store.addDiagnosticRecord(input);
      void logger.logAsCurrentRole(LogEventId.DiagnosticComplete, {
        disposition: input.outcome === 'pass' ? 'success' : 'failure',
        message: `Diagnostic (${input.type}) completed with outcome: ${input.outcome}.`,
        type: input.type,
      });
    },

    getMostRecentPrinterDiagnostic(): DiagnosticRecord | null {
      return store.getMostRecentDiagnosticRecord('test-print') ?? null;
    },

    async printTestPage(): Promise<void> {
      await printTestPage({ printer, logger });
    },

    async saveReadinessReport(): Promise<ExportDataResult> {
      return saveReadinessReport({ workspace, printer, usbDrive, logger });
    },

    getTestDeckBallotCount(input: { precinctId?: PrecinctId }): number {
      const electionRecord = store.getElectionRecord();
      if (!electionRecord) {
        return 0;
      }
      const { election } = electionRecord.electionDefinition;
      if (!electionHasBallotPositions(election)) {
        return 0;
      }

      const precinctIds = input.precinctId
        ? [input.precinctId]
        : election.precincts.map((precinct) => precinct.id);

      return getTestDeckBallotsToPrint(election, precinctIds).length;
    },

    async printTestDeck(input: {
      /** Print for the specified precinct or overall if undefined */
      precinctId?: PrecinctId;
      /**
       * When set, print only the overall tally report, no ballots and no
       * per-precinct reports
       */
      overallTallyReportOnly?: boolean;
    }): Promise<void> {
      const { electionDefinition } = assertDefined(store.getElectionRecord());
      const { election } = electionDefinition;
      const { precinctId, overallTallyReportOnly } = input;
      await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
        message: 'Attempting to print test deck',
        testDeckProps: JSON.stringify({
          precinctId: precinctId || 'all',
          overallTallyReportOnly: overallTallyReportOnly ?? false,
        }),
      });

      const precinctIds = precinctId
        ? [precinctId]
        : election.precincts.map((precinct) => precinct.id);

      const ballotsToPrint = overallTallyReportOnly
        ? []
        : getTestDeckBallotsToPrint(election, precinctIds);
      for (const { spec, ballot } of ballotsToPrint) {
        const basePdf = Uint8Array.from(
          Buffer.from(ballot.encodedBallot, 'base64')
        );
        const hasVotes = Object.keys(spec.votes).length > 0;
        const markedPdf = hasVotes
          ? await generateMarkOverlay(
              election,
              spec.ballotStyleId,
              spec.votes,
              { offsetMmX: 0, offsetMmY: 0 },
              basePdf
            )
          : basePdf;
        await printBallots(electionDefinition, {
          data: Buffer.from(markedPdf),
          copies: 1,
        });
      }

      const allCvrs = generateTestDeckCastVoteRecords(election, {
        includeSummaryBallots: false,
        includeBubbleBallots: true,
      });

      const reportPrecinctIds: Array<PrecinctId | undefined> = (() => {
        if (overallTallyReportOnly) {
          return [undefined];
        }
        if (precinctId) {
          return [precinctId];
        }
        return [undefined, ...election.precincts.map((p) => p.id)];
      })();
      try {
        for (const reportPrecinctId of reportPrecinctIds) {
          await printTestDeckTallyReport(
            electionDefinition,
            allCvrs,
            reportPrecinctId
          );
        }
        await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
          message: 'Printed test deck',
          disposition: 'success',
          ballotCount: ballotsToPrint.length,
        });
      } catch (error) {
        /* istanbul ignore next */
        await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
          message: 'Error printing test deck',
          disposition: 'failure',
          errorDetails: error instanceof Error ? error.message : String(error),
        });
      } finally {
        await cleanupCachedBrowser();
      }
    },
  } as const;

  return grout.createApi(methods);
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(context: AppContext): Application {
  const app: Application = express();

  const api = buildApi(context);

  app.use('/api', grout.buildRouter(api, express));

  return app;
}
