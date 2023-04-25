import express, { Application } from 'express';
import { z } from 'zod';
import {
  DEV_JURISDICTION,
  InsertedSmartCardAuthApi,
  InsertedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { assert, err, ok, Optional, Result } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import {
  BallotPackageConfigurationError,
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  SystemSettings,
  DEFAULT_SYSTEM_SETTINGS,
} from '@votingworks/types';
import { ScannerReportData, ScannerReportDataSchema } from '@votingworks/utils';

import { Usb, readBallotPackageFromUsb } from '@votingworks/backend';
import { Logger } from '@votingworks/logging';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';

function constructAuthMachineState(
  workspace: Workspace
): InsertedSmartCardAuthMachineState {
  const electionDefinition = workspace.store.getElectionDefinition();
  return {
    electionHash: electionDefinition?.electionHash,
    // TODO: Persist jurisdiction in store and pull from there
    jurisdiction: DEV_JURISDICTION,
  };
}

function buildApi(
  auth: InsertedSmartCardAuthApi,
  usb: Usb,
  logger: Logger,
  workspace: Workspace
) {
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

    endCardlessVoterSession() {
      return auth.endCardlessVoterSession(constructAuthMachineState(workspace));
    },

    getElectionDefinition(): ElectionDefinition | null {
      return workspace.store.getElectionDefinition() ?? null;
    },

    getSystemSettings(): SystemSettings | null {
      return workspace.store.getSystemSettings() ?? null;
    },

    unconfigureMachine() {
      workspace.store.setElection(undefined);
      workspace.store.deleteSystemSettings();
    },

    configureSampleBallotPackage(): Result<
      ElectionDefinition,
      BallotPackageConfigurationError
    > {
      const electionDefinition = electionSampleDefinition;
      const systemSettings = DEFAULT_SYSTEM_SETTINGS;
      workspace.store.setElection(electionDefinition.electionData);
      workspace.store.setSystemSettings(systemSettings);
      return ok(electionDefinition);
    },

    async configureBallotPackageFromUsb(): Promise<
      Result<ElectionDefinition, BallotPackageConfigurationError>
    > {
      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace)
      );

      const [usbDrive] = await usb.getUsbDrives();
      assert(usbDrive?.mountPoint !== undefined, 'No USB drive mounted');

      const ballotPackageResult = await readBallotPackageFromUsb(
        authStatus,
        usbDrive,
        logger
      );

      if (ballotPackageResult.isErr()) {
        return ballotPackageResult;
      }

      const { electionDefinition, systemSettings } = ballotPackageResult.ok();
      assert(systemSettings);
      workspace.store.setElection(electionDefinition.electionData);
      workspace.store.setSystemSettings(systemSettings);
      return ok(electionDefinition);
    },

    async readScannerReportDataFromCard(): Promise<
      Result<Optional<ScannerReportData>, SyntaxError | z.ZodError | Error>
    > {
      const machineState = constructAuthMachineState(workspace);
      const authStatus = await auth.getAuthStatus(machineState);
      if (authStatus.status !== 'logged_in') {
        return err(new Error('User is not logged in'));
      }
      if (authStatus.user.role !== 'poll_worker') {
        return err(new Error('User is not a poll worker'));
      }

      return await auth.readCardData(machineState, {
        schema: ScannerReportDataSchema,
      });
    },

    async clearScannerReportDataFromCard(): Promise<Result<void, Error>> {
      const machineState = constructAuthMachineState(workspace);
      const authStatus = await auth.getAuthStatus(machineState);
      if (authStatus.status !== 'logged_in') {
        return err(new Error('User is not logged in'));
      }
      if (authStatus.user.role !== 'poll_worker') {
        return err(new Error('User is not a poll worker'));
      }

      return await auth.clearCardData(machineState);
    },
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(
  auth: InsertedSmartCardAuthApi,
  logger: Logger,
  workspace: Workspace,
  usb: Usb
): Application {
  const app: Application = express();
  const api = buildApi(auth, usb, logger, workspace);
  app.use('/api', grout.buildRouter(api, express));
  useDevDockRouter(app, express);
  return app;
}
