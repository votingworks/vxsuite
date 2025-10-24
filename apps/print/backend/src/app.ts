import * as grout from '@votingworks/grout';
import { Buffer } from 'node:buffer';
import express, { Application } from 'express';
import { assert, err, ok, Result } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import {
  ElectionDefinition,
  ElectionPackageConfigurationError,
  PrinterStatus,
} from '@votingworks/types';
import { readSignedElectionPackageFromUsb } from '@votingworks/backend';
import { isElectionManagerAuth } from '@votingworks/utils';
import { UsbDriveStatus } from '@votingworks/usb-drive';
import { AppContext } from './context';
import { rootDebug } from './debug';
import { constructAuthMachineState } from './util/auth';
import { BallotPrintEntry } from './types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const debug = rootDebug.extend('app');

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi(ctx: AppContext) {
  const { auth, usbDrive, logger, workspace, printer } = ctx;
  const { store } = workspace;

  const methods = {
    getAuthStatus() {
      return auth.getAuthStatus(constructAuthMachineState(workspace));
    },

    checkPin(input: { pin: string }) {
      return auth.checkPin(constructAuthMachineState(workspace), input);
    },

    getPrinterStatus(): Promise<PrinterStatus> {
      return printer.status();
    },

    async getUsbDriveStatus(): Promise<UsbDriveStatus> {
      return usbDrive.status();
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
        return err('no_ballots');
      }
      assert(systemSettings);

      store.withTransaction(() => {
        store.setElection({
          electionData: electionDefinition.electionData,
          electionPackageHash,
        });
        store.setSystemSettings(systemSettings);
        store.setBallots(ballots);
      });

      await logger.logAsCurrentRole(LogEventId.ElectionConfigured, {
        message: `Machine configured for election with hash: ${electionDefinition.ballotHash}`,
        disposition: 'success',
        ballotHash: electionDefinition.ballotHash,
      });

      return ok(electionDefinition);
    },

    getElectionDefinition(): ElectionDefinition | null {
      return store.getElectionRecord()?.electionDefinition || null;
    },

    unconfigureMachine(): void {
      store.deleteBallots();
      store.deleteSystemSettings();
      store.deleteElectionRecord();
    },

    getBallots(): BallotPrintEntry[] {
      return store.getBallots();
    },

    async printBallot(input: { ballotPrintId: string }) {
      const printerStatus = await printer.status();
      await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
        message: `Attempting to print ballot with internal id ${input.ballotPrintId}`,
        printConnected: printerStatus.connected,
      });
      const ballot = store.getBallot(input.ballotPrintId);
      if (!ballot || !ballot.encodedBallot) {
        await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
          message: `No ballot found with id ${input.ballotPrintId}`,
          disposition: 'failure',
        });
        return;
      }

      await printer.print({
        data: Buffer.from(ballot.encodedBallot, 'base64'),
      });
      await logger.logAsCurrentRole(LogEventId.PrinterPrintRequest, {
        message: `Printed ballot ${input.ballotPrintId}}`,
        ballotProps: JSON.stringify({
          ballotStyleId: ballot.ballotStyleId,
          precinctId: ballot.precinctId,
          ballotMode: ballot.ballotMode,
          ballotType: ballot.ballotType,
        }),
        disposition: 'success',
      });
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
