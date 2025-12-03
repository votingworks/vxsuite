import * as grout from '@votingworks/grout';
// import { Buffer } from 'node:buffer';
import express, { Application } from 'express';
import { assert, assertDefined, err, ok, Result } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import {
  ElectionDefinition,
  ElectionPackageConfigurationError,
  PrecinctId,
  PrecinctSelection,
  PrinterStatus,
  SinglePrecinctSelection,
  LanguageCode,
  Id,
  BallotType,
} from '@votingworks/types';
import {
  createSystemCallApi,
  ElectionRecord,
  readSignedElectionPackageFromUsb,
} from '@votingworks/backend';
import {
  getPrecinctSelectionName,
  isElectionManagerAuth,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { generateSignedHashValidationQrCodeValue } from '@votingworks/auth';
import { AppContext } from './context';
import { rootDebug } from './debug';
import { constructAuthMachineState } from './util/auth';
import {
  printBallotsPrintedReport,
  exportBallotsPrintedReportPdf,
} from './reports/ballots_printed_report';
import { BallotPrintCount, BallotPrintEntry, DeviceStatuses } from './types';
import { getMachineConfig } from './machine_config';
import { findBallotStyleId } from './util/ballot_styles';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const debug = rootDebug.extend('app');

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi(ctx: AppContext) {
  const { auth, usbDrive, logger, workspace, printer } = ctx;
  const { store } = workspace;

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

    getPrinterStatus(): Promise<PrinterStatus> {
      return printer.status();
    },

    async configureElectionPackageFromUsb(): Promise<
      Result<ElectionDefinition, ElectionPackageConfigurationError>
    > {
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
      const { electionDefinition, systemSettings, ballots } = electionPackage;
      if (!ballots) {
        return err({ type: 'no_ballots' });
      }
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
        store.setSystemSettings(systemSettings);
        store.setBallots(ballots);
        if (precinctSelection) {
          store.setPrecinctSelection(precinctSelection);
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

    getPrecinctSelection(): PrecinctSelection | null {
      return store.getPrecinctSelection() || null;
    },

    async setPrecinctSelection(input: {
      precinctSelection: PrecinctSelection;
    }): Promise<void> {
      const { electionDefinition } = assertDefined(store.getElectionRecord());
      store.setPrecinctSelection(input.precinctSelection);
      await logger.logAsCurrentRole(LogEventId.PrecinctConfigurationChanged, {
        disposition: 'success',
        message: `User set the precinct for the machine to ${getPrecinctSelectionName(
          electionDefinition.election.precincts,
          input.precinctSelection
        )}`,
      });
    },

    unconfigureMachine(): void {
      store.deleteBallots();
      store.deleteSystemSettings();
      store.setPrecinctSelection(undefined);
      store.deleteElectionRecord();
    },

    /* istanbul ignore next - @preserve */
    async generateSignedHashValidationQrCodeValue() {
      await logger.logAsCurrentRole(LogEventId.SignedHashValidationInit);

      const { codeVersion } = getMachineConfig();
      const electionRecord = store.getElectionRecord();
      const qrCodeValue = await generateSignedHashValidationQrCodeValue({
        electionRecord,
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

    getBallots(): BallotPrintEntry[] {
      return store.getBallots();
    },

    getBallotPrintCounts({
      precinctId,
    }: {
      precinctId?: PrecinctId;
    }): BallotPrintCount[] {
      return store.getBallotPrintCounts({ precinctId });
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

      // TODO(nikhil): Actually print ballot, increment print count within transaction
      store.incrementBallotPrintCount({
        precinctId: input.precinctId,
        ballotStyleId,
        ballotType: input.ballotType,
        count: input.copies,
      });

      // const ballot = store.getBallot({
      //   ballotStyleId,
      //   precinctId: input.precinctId,
      //   ballotType: input.ballotType,
      // });
      // if (!ballot || !ballot.encodedBallot) {
      //   await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
      //     message: 'No ballot found',
      //     ballotProps: JSON.stringify({
      //       precinctId: input.precinctId,
      //       splitId: input.splitId,
      //       partyId: input.partyId,
      //       languageCode: input.languageCode,
      //       ballotType: input.ballotType,
      //     }),
      //     disposition: 'failure',
      //   });
      //   return;
      // }
      // await printer.print({
      //   data: Buffer.from(ballot.encodedBallot, 'base64'),
      // });

      await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
        message: `Printed ballot ${ballotStyleId} with ${input.copies} copies`,
        ballotProps: JSON.stringify({
          ballotStyleId,
          precinctId: input.precinctId,
          splitId: input.splitId,
          partyId: input.partyId,
          languageCode: input.languageCode,
          ballotType: input.ballotType,
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
      const [usbDriveStatus, printerStatus] = await Promise.all([
        usbDrive.status(),
        printer.status(),
      ]);
      return {
        usbDrive: usbDriveStatus,
        printer: printerStatus,
      };
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
