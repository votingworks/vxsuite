import express, { Application } from 'express';
import {
  InsertedSmartCardAuthApi,
  InsertedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { assert, ok, Optional, Result } from '@votingworks/basics';
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
  PrecinctSelection,
  AllPrecinctsSelection,
  InterpretedBmdPage,
} from '@votingworks/types';
import {
  isElectionManagerAuth,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';

import { Usb, readBallotPackageFromUsb } from '@votingworks/backend';
import { Logger } from '@votingworks/logging';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import makeDebug from 'debug';
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';
import {
  PaperHandlerStateMachine,
  SimpleServerStatus,
} from './custom-paper-handler';

const debug = makeDebug('mark-scan:app-backend');

const defaultMediaMountDir = '/media';

function constructAuthMachineState(
  workspace: Workspace
): InsertedSmartCardAuthMachineState {
  const electionDefinition = workspace.store.getElectionDefinition();
  const jurisdiction = workspace.store.getJurisdiction();
  const systemSettings =
    workspace.store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
  return {
    ...systemSettings.auth,
    electionHash: electionDefinition?.electionHash,
    jurisdiction,
  };
}

function buildApi(
  auth: InsertedSmartCardAuthApi,
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

    setPrecinctSelection(input: {
      precinctSelection: PrecinctSelection | AllPrecinctsSelection;
    }): void {
      workspace.store.setPrecinctSelection(input.precinctSelection);
    },

    getPrecinctSelection(): Optional<PrecinctSelection> {
      return workspace.store.getPrecinctSelection();
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

      const { precincts } = electionDefinition.election;
      if (precincts.length === 1) {
        workspace.store.setPrecinctSelection(
          singlePrecinctSelectionFor(precincts[0].id)
        );
      }

      return ok(electionDefinition);
    },

    getPaperHandlerState(): SimpleServerStatus {
      if (!stateMachine) {
        return 'no_hardware';
      }

      return stateMachine.getSimpleStatus();
    },

    setAcceptingPaperState(): SimpleServerStatus {
      if (!stateMachine) {
        return 'no_hardware';
      }

      stateMachine.setAcceptingPaper();
      return stateMachine.getSimpleStatus();
    },

    printBallot(input: { pdfData: Buffer }): SimpleServerStatus {
      if (!stateMachine) {
        return 'no_hardware';
      }

      void stateMachine.printBallot(input.pdfData);
      return stateMachine.getSimpleStatus();
    },

    getInterpretation(): InterpretedBmdPage | null {
      if (!stateMachine) {
        throw new Error('No state machine present');
      }

      // Storing the interpretation in the db requires a somewhat complicated schema
      // and would need to be deleted at the end of the voter session anyway.
      // If we can get away with storing the interpretation in memory only in the
      // state machine we should. This simplifies the logic and reduces the risk
      // of accidentally persisting ballot selections to disk.
      const sheetInterpretation = stateMachine.getInterpretation();

      if (!sheetInterpretation) {
        return null;
      }

      assert(
        sheetInterpretation[0].interpretation.type === 'InterpretedBmdPage'
      );
      // It's impossible to print to the back page from the thermal printer
      assert(sheetInterpretation[1].interpretation.type === 'BlankPage');

      // Omit image data before sending to client. It's long, gets logged, and we don't need it.
      return sheetInterpretation[0].interpretation;
    },

    validateBallot() {
      if (!stateMachine) {
        throw new Error('No state machine present');
      }

      debug('API validate');
      stateMachine.validateBallot();
    },

    invalidateBallot() {
      if (!stateMachine) {
        throw new Error('No state machine present');
      }

      debug('API invalidate');
      stateMachine.invalidateBallot();
    },
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(
  auth: InsertedSmartCardAuthApi,
  logger: Logger,
  workspace: Workspace,
  usb: Usb,
  stateMachine?: PaperHandlerStateMachine,
  dataUsbMountPrefix?: string
): Application {
  const app: Application = express();
  const api = buildApi(
    auth,
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
