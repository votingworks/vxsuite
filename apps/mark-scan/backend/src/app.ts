import express, { Application } from 'express';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import {
  assert,
  assertDefined,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import { Buffer } from 'buffer';
import {
  ElectionPackageConfigurationError,
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  SystemSettings,
  DEFAULT_SYSTEM_SETTINGS,
  PrecinctSelection,
  InterpretedBmdPage,
  PollsState,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  isElectionManagerAuth,
  isFeatureFlagEnabled,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';

import {
  createUiStringsApi,
  readSignedElectionPackageFromUsb,
  configureUiStrings,
} from '@votingworks/backend';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import makeDebug from 'debug';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import { getMachineConfig } from './machine_config';
import { Workspace, constructAuthMachineState } from './util/workspace';
import {
  PaperHandlerStateMachine,
  SimpleServerStatus,
} from './custom-paper-handler';
import { ElectionState } from './types';

const debug = makeDebug('mark-scan:app-backend');

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi(
  auth: InsertedSmartCardAuthApi,
  usbDrive: UsbDrive,
  logger: Logger,
  workspace: Workspace,
  stateMachine?: PaperHandlerStateMachine
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

    getPaperHandlerState(): SimpleServerStatus {
      if (!stateMachine) {
        return 'no_hardware';
      }

      return stateMachine.getSimpleStatus();
    },

    setAcceptingPaperState(): void {
      if (
        isFeatureFlagEnabled(
          BooleanEnvironmentVariableName.SKIP_PAPER_HANDLER_HARDWARE_CHECK
        )
      ) {
        return;
      }

      assert(stateMachine);

      stateMachine.setAcceptingPaper();
    },

    setPatDeviceIsCalibrated(): void {
      assert(stateMachine, 'No state machine');

      stateMachine.setPatDeviceIsCalibrated();
    },

    printBallot(input: { pdfData: Buffer }): void {
      store.setBallotsPrintedCount(store.getBallotsPrintedCount() + 1);

      assert(stateMachine);
      void stateMachine.printBallot(input.pdfData);
    },

    getInterpretation(): InterpretedBmdPage | null {
      assert(stateMachine);

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

    validateBallot(): void {
      assert(stateMachine);

      debug('API validate');
      stateMachine.validateBallot();
    },

    invalidateBallot(): void {
      assert(stateMachine);

      debug('API invalidate');
      stateMachine.invalidateBallot();
    },

    confirmInvalidateBallot(): void {
      assert(stateMachine);

      stateMachine.confirmInvalidateBallot();
    },

    ...createUiStringsApi({
      logger,
      store: workspace.store.getUiStringsStore(),
    }),

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
  usbDrive: UsbDrive,
  stateMachine?: PaperHandlerStateMachine
): Application {
  const app: Application = express();
  const api = buildApi(auth, usbDrive, logger, workspace, stateMachine);
  app.use('/api', grout.buildRouter(api, express));
  useDevDockRouter(app, express);
  return app;
}
