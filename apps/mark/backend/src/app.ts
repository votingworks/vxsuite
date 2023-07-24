import express, { Application } from 'express';
import {
  ArtifactAuthenticatorApi,
  InsertedSmartCardAuthApi,
  InsertedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { assert, ok, Result } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import {
  BallotPackageConfigurationError,
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  SystemSettings,
  DEFAULT_SYSTEM_SETTINGS,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { isElectionManagerAuth } from '@votingworks/utils';

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
  const jurisdiction = workspace.store.getJurisdiction();
  const systemSettings = workspace.store.getSystemSettings();
  return {
    ...(systemSettings ?? {}),
    electionHash: electionDefinition?.electionHash,
    jurisdiction,
  };
}

function buildApi(
  auth: InsertedSmartCardAuthApi,
  artifactAuthenticator: ArtifactAuthenticatorApi,
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
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(
  auth: InsertedSmartCardAuthApi,
  artifactAuthenticator: ArtifactAuthenticatorApi,
  logger: Logger,
  workspace: Workspace,
  usb: Usb
): Application {
  const app: Application = express();
  const api = buildApi(auth, artifactAuthenticator, usb, logger, workspace);
  app.use('/api', grout.buildRouter(api, express));
  useDevDockRouter(app, express);
  return app;
}
