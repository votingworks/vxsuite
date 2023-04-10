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
  safeParseElectionDefinition,
} from '@votingworks/types';
import { ScannerReportData, ScannerReportDataSchema } from '@votingworks/utils';

import { Usb, readBallotPackageFromUsb } from '@votingworks/backend';
import { Logger } from '@votingworks/logging';
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';

function constructAuthMachineState({
  electionHash,
}: {
  electionHash?: string;
}): InsertedSmartCardAuthMachineState {
  return {
    // TODO: Persist election definition in store and pull from there
    electionHash,
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

    // TODO: Once election definition has been moved to the backend, no longer require the frontend
    // to provide election hash to this and other methods that use the auth lib
    getAuthStatus(input: { electionHash?: string }) {
      return auth.getAuthStatus(constructAuthMachineState(input));
    },

    checkPin(input: { electionHash?: string; pin: string }) {
      return auth.checkPin(constructAuthMachineState(input), {
        pin: input.pin,
      });
    },

    logOut(input: { electionHash?: string }) {
      return auth.logOut(constructAuthMachineState(input));
    },

    updateSessionExpiry(input: {
      electionHash?: string;
      sessionExpiresAt: Date;
    }) {
      return auth.updateSessionExpiry(constructAuthMachineState(input), {
        sessionExpiresAt: input.sessionExpiresAt,
      });
    },

    startCardlessVoterSession(input: {
      electionHash?: string;
      ballotStyleId: BallotStyleId;
      precinctId: PrecinctId;
    }) {
      return auth.startCardlessVoterSession(constructAuthMachineState(input), {
        ballotStyleId: input.ballotStyleId,
        precinctId: input.precinctId,
      });
    },

    endCardlessVoterSession(input: { electionHash?: string }) {
      return auth.endCardlessVoterSession(constructAuthMachineState(input));
    },

    getSystemSettings(): SystemSettings | undefined {
      return workspace.store.getSystemSettings();
    },

    async configureBallotPackageFromUsb(input: {
      electionHash: string;
    }): Promise<Result<void, BallotPackageConfigurationError>> {
      const machineState = constructAuthMachineState(input);
      const authStatus = await auth.getAuthStatus(machineState);

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
      return ok();
    },

    async readElectionDefinitionFromCard(input: {
      electionHash?: string;
    }): Promise<Result<ElectionDefinition, Error>> {
      const machineState = constructAuthMachineState(input);
      const authStatus = await auth.getAuthStatus(machineState);
      if (authStatus.status !== 'logged_in') {
        return err(new Error('User is not logged in'));
      }
      if (authStatus.user.role !== 'election_manager') {
        return err(new Error('User is not an election manager'));
      }

      const result = await auth.readCardDataAsString(machineState);
      const electionData = result.ok();
      const electionDefinition = electionData
        ? safeParseElectionDefinition(electionData).ok()
        : undefined;

      if (!electionDefinition) {
        // While we could provide more specific error messages for different error cases, the
        // frontend doesn't need that much detail
        return err(new Error('Unable to read election definition from card'));
      }
      return ok(electionDefinition);
    },

    async readScannerReportDataFromCard(input: {
      electionHash?: string;
    }): Promise<
      Result<Optional<ScannerReportData>, SyntaxError | z.ZodError | Error>
    > {
      const machineState = constructAuthMachineState(input);
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

    async clearScannerReportDataFromCard(input: {
      electionHash?: string;
    }): Promise<Result<void, Error>> {
      const machineState = constructAuthMachineState(input);
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
  return app;
}
