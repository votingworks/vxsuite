import express, { Application } from 'express';
import { z } from 'zod';
import {
  ArtifactAuthenticatorApi,
  InsertedSmartCardAuthApi,
  InsertedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { assert, err, ok, Optional, Result } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import { Buffer } from 'buffer';
import {
  BallotPackageConfigurationError,
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  SystemSettings,
  DEFAULT_SYSTEM_SETTINGS,
  TEST_JURISDICTION,
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
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';
import { PaperHandlerStateMachine } from './custom-paper-handler/state_machine';
import { SimpleServerStatus } from './custom-paper-handler/types';

const defaultMediaMountDir = '/media';

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
  workspace: Workspace,
  stateMachine?: PaperHandlerStateMachine,
  // mark-scan hardware boots off a USB drive so we need to differentiate between USBs.
  // Allow overriding for tests
  dataUsbMountPrefix = defaultMediaMountDir
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
      const usbDrives = await usb.getUsbDrives();
      // mark-scan hardware boots off a USB drive so we need to find the media drive
      const usbDrive = usbDrives.find((drive) =>
        drive.mountPoint?.startsWith(dataUsbMountPrefix)
      );
      const mountPoints = usbDrives
        .map((drive) => drive.mountPoint || '<none>')
        .join(', ');
      assert(
        usbDrive !== undefined,
        `No USB drive mounted to ${dataUsbMountPrefix}. Got mount points: ${mountPoints}`
      );

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

    async getPaperHandlerState(): Promise<SimpleServerStatus> {
      if (!stateMachine) {
        return 'no_hardware';
      }

      return stateMachine.getSimpleStatus();
    },

    async parkPaper(): Promise<SimpleServerStatus> {
      if (!stateMachine) {
        return 'no_hardware';
      }

      await stateMachine.parkPaper();
      return stateMachine.getSimpleStatus();
    },

    // prints and presents a completed ballot
    async printBallot(input: { pdfData: Buffer }): Promise<SimpleServerStatus> {
      if (!stateMachine) {
        return 'no_hardware';
      }

      await stateMachine.printBallot(input.pdfData);
      await stateMachine.presentPaper();
      return stateMachine.getSimpleStatus();
    },
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(
  auth: InsertedSmartCardAuthApi,
  artifactAuthenticator: ArtifactAuthenticatorApi,
  logger: Logger,
  workspace: Workspace,
  usb: Usb,
  stateMachine?: PaperHandlerStateMachine,
  dataUsbMountPrefix?: string
): Application {
  const app: Application = express();
  const api = buildApi(
    auth,
    artifactAuthenticator,
    usb,
    logger,
    workspace,
    stateMachine,
    dataUsbMountPrefix
  );
  app.use('/api', grout.buildRouter(api, express));
  useDevDockRouter(app, express);
  return app;
}
