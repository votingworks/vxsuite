import express, { Application } from 'express';
import {
  InsertedSmartCardAuthApi,
  InsertedSmartCardAuthMachineState,
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
  PrecinctSelection,
} from '@votingworks/types';
import {
  isElectionManagerAuth,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';

import {
  createUiStringsApi,
  readSignedElectionPackageFromUsb,
  configureUiStrings,
  createSystemCallApi,
} from '@votingworks/backend';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';
import { ElectionState } from './types';

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

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi(
  auth: InsertedSmartCardAuthApi,
  usbDrive: UsbDrive,
  logger: Logger,
  workspace: Workspace
) {
  const { store } = workspace;

  async function getUserRole(): Promise<LoggingUserRole> {
    const authStatus = await auth.getAuthStatus(
      constructAuthMachineState(workspace)
    );
    return authStatus.status === 'logged_in' ? authStatus.user.role : 'unknown';
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
      return usbDrive.eject(assertDefined(await getUserRole()));
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

    getElectionDefinition(): ElectionDefinition | null {
      return workspace.store.getElectionDefinition() ?? null;
    },

    getSystemSettings(): SystemSettings {
      return workspace.store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
    },

    unconfigureMachine() {
      workspace.store.reset();
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
        return electionPackageResult;
      }
      assert(isElectionManagerAuth(authStatus));
      const electionPackage = electionPackageResult.ok();
      const { electionDefinition, systemSettings } = electionPackage;
      assert(systemSettings);

      workspace.store.withTransaction(() => {
        workspace.store.setElectionAndJurisdiction({
          electionData: electionDefinition.electionData,
          jurisdiction: authStatus.user.jurisdiction,
        });
        workspace.store.setSystemSettings(systemSettings);

        // automatically set precinct for single precinct elections
        if (electionDefinition.election.precincts.length === 1) {
          workspace.store.setPrecinctSelection(
            singlePrecinctSelectionFor(
              electionDefinition.election.precincts[0].id
            )
          );
        }

        configureUiStrings({
          electionPackage,
          logger,
          store: workspace.store.getUiStringsStore(),
        });
      });

      await logger.log(LogEventId.ElectionPackageLoadedFromUsb, 'system', {
        disposition: 'success',
      });

      return ok(electionDefinition);
    },

    ...createUiStringsApi({
      logger,
      store: workspace.store.getUiStringsStore(),
    }),

    ...createSystemCallApi({
      usbDrive,
      machineId: getMachineConfig().machineId,
    }),

    incrementBallotsPrintedCount() {
      store.setBallotsPrintedCount(store.getBallotsPrintedCount() + 1);
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
              // logging case handled by ResetPollsToPausedButton
              return undefined;
            }
            return LogEventId.VotingPaused;
          case 'polls_open':
            if (oldPollsState === 'polls_closed_initial') {
              return LogEventId.PollsOpened;
            }
            return LogEventId.VotingResumed;
          /* istanbul ignore next */
          default:
            throwIllegalValue(newPollsState);
        }
      })();
      if (logEvent) {
        await logger.log(logEvent, 'poll_worker', { disposition: 'success' });
      }
    },

    setTestMode(input: { isTestMode: boolean }) {
      store.setTestMode(input.isTestMode);
      store.setPollsState('polls_closed_initial');
      store.setBallotsPrintedCount(0);
    },

    setPrecinctSelection(input: {
      precinctSelection: PrecinctSelection;
    }): void {
      store.setPrecinctSelection(input.precinctSelection);
      store.setBallotsPrintedCount(0);
    },

    getElectionState(): ElectionState {
      return {
        precinctSelection: store.getPrecinctSelection(),
        ballotsPrintedCount: store.getBallotsPrintedCount(),
        isTestMode: store.getTestMode(),
        pollsState: store.getPollsState(),
      };
    },
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(
  auth: InsertedSmartCardAuthApi,
  logger: Logger,
  workspace: Workspace,
  usbDrive: UsbDrive
): Application {
  const app: Application = express();
  const api = buildApi(auth, usbDrive, logger, workspace);
  app.use('/api', grout.buildRouter(api, express));
  useDevDockRouter(app, express, 'mark');
  return app;
}
