import express, { Application } from 'express';
import { z } from 'zod';
import {
  ArtifactAuthenticatorApi,
  InsertedSmartCardAuthApi,
  InsertedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { assert, err, ok, Optional, Result, sleep } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import {
  BallotPackageConfigurationError,
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  SystemSettings,
  DEFAULT_SYSTEM_SETTINGS,
  TEST_JURISDICTION,
  InsertedSmartCardAuth,
} from '@votingworks/types';
import {
  ScannerReportData,
  ScannerReportDataSchema,
  isElectionManagerAuth,
} from '@votingworks/utils';

import { Usb, readBallotPackageFromUsb } from '@votingworks/backend';
import { Logger } from '@votingworks/logging';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { isDeepStrictEqual } from 'util';
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';

function constructAuthMachineState(
  workspace: Workspace
): InsertedSmartCardAuthMachineState {
  const electionDefinition = workspace.store.getElectionDefinition();
  const jurisdiction = workspace.store.getJurisdiction();
  const systemSettings = workspace.store.getSystemSettings();
  return {
    ...(systemSettings ?? {}),
    electionHash: electionDefinition?.electionHash,
    jurisdiction,
  };
}

function buildRpcApi(
  auth: InsertedSmartCardAuthApi,
  artifactAuthenticator: ArtifactAuthenticatorApi,
  usb: Usb,
  logger: Logger,
  workspace: Workspace
) {
  return grout.createRpcApi({
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

    getSystemSettings(): SystemSettings {
      return workspace.store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
    },

    unconfigureMachine() {
      workspace.store.setElectionAndJurisdiction(undefined);
      workspace.store.deleteSystemSettings();
    },

    configureWithSampleBallotPackageForIntegrationTest(): Result<
      ElectionDefinition,
      BallotPackageConfigurationError
    > {
      const electionDefinition = electionSampleDefinition;
      const systemSettings = DEFAULT_SYSTEM_SETTINGS;
      workspace.store.setElectionAndJurisdiction({
        electionData: electionDefinition.electionData,
        jurisdiction: TEST_JURISDICTION,
      });
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
        artifactAuthenticator,
        usbDrive,
        logger
      );
      if (ballotPackageResult.isErr()) {
        return ballotPackageResult;
      }
      assert(isElectionManagerAuth(authStatus));
      const { electionDefinition, systemSettings } = ballotPackageResult.ok();
      assert(systemSettings);

      workspace.store.setElectionAndJurisdiction({
        electionData: electionDefinition.electionData,
        jurisdiction: authStatus.user.jurisdiction,
      });
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

export type RpcApi = ReturnType<typeof buildRpcApi>;

function buildStreamApi(auth: InsertedSmartCardAuthApi, workspace: Workspace) {
  return grout.createStreamApi({
    async *watchAuthStatus() {
      let lastAuthStatus: InsertedSmartCardAuth.AuthStatus | undefined;

      while (true) {
        const authStatus = await auth.getAuthStatus(
          constructAuthMachineState(workspace)
        );
        if (!isDeepStrictEqual(authStatus, lastAuthStatus)) {
          yield authStatus;
          lastAuthStatus = authStatus;
        }
        await sleep(100);
      }
    },
  });
}

export type StreamApi = ReturnType<typeof buildStreamApi>;

export function buildApp(
  auth: InsertedSmartCardAuthApi,
  artifactAuthenticator: ArtifactAuthenticatorApi,
  logger: Logger,
  workspace: Workspace,
  usb: Usb
): Application {
  const app: Application = express();
  const rpcApi = buildRpcApi(
    auth,
    artifactAuthenticator,
    usb,
    logger,
    workspace
  );
  app.use('/api', grout.buildRpcRouter(rpcApi, express));
  const streamApi = buildStreamApi(auth, workspace);
  app.use('/api', grout.buildStreamRouter(streamApi, express));
  useDevDockRouter(app, express);
  return app;
}
