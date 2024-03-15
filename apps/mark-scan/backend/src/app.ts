import express, { Application } from 'express';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import { assert, ok, Result, throwIllegalValue } from '@votingworks/basics';
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
  DiagnosticRecord,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getPrecinctSelectionName,
  isElectionManagerAuth,
  isFeatureFlagEnabled,
  isPollWorkerAuth,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';

import {
  createUiStringsApi,
  readSignedElectionPackageFromUsb,
  configureUiStrings,
  createSystemCallApi,
  DiskSpaceSummary,
} from '@votingworks/backend';
import { LogEventId, Logger } from '@votingworks/logging';
import { useDevDockRouter } from '@votingworks/dev-dock-backend';
import { UsbDrive, UsbDriveStatus } from '@votingworks/usb-drive';
import { getMachineConfig } from './machine_config';
import { Workspace, constructAuthMachineState } from './util/workspace';
import {
  PaperHandlerStateMachine,
  SimpleServerStatus,
} from './custom-paper-handler';
import { ElectionState } from './types';
import { isAccessibleControllerDaemonRunning } from './util/controllerd';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function buildApi(
  auth: InsertedSmartCardAuthApi,
  usbDrive: UsbDrive,
  logger: Logger,
  workspace: Workspace,
  stateMachine?: PaperHandlerStateMachine
) {
  const { store } = workspace;

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
      return usbDrive.eject();
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

    getPaperHandlerState(): SimpleServerStatus {
      if (!stateMachine) {
        return 'no_hardware';
      }

      return stateMachine.getSimpleStatus();
    },

    setAcceptingPaperState(): void {
      if (
        isFeatureFlagEnabled(
          BooleanEnvironmentVariableName.USE_MOCK_PAPER_HANDLER
        )
      ) {
        return;
      }

      assert(stateMachine);

      stateMachine.setAcceptingPaper();
    },

    /**
     * Sets whether the voter has completed the PAT device calibration flow after a device a connected.
     */
    setPatDeviceIsCalibrated(): void {
      assert(stateMachine, 'No state machine');

      stateMachine.setPatDeviceIsCalibrated();
    },

    printBallot(input: { pdfData: Buffer }): void {
      store.setBallotsPrintedCount(store.getBallotsPrintedCount() + 1);

      if (
        isFeatureFlagEnabled(
          BooleanEnvironmentVariableName.USE_MOCK_PAPER_HANDLER
        )
      ) {
        if (!stateMachine) {
          return;
        }

        // Mock print behavior when no paper handler is connected.
        // Skips the print state, sets the scanned ballot filepaths to
        // a fixture for Sample General Election, North Springfield, ballot style 5,
        // and continues to the interpretation state.
        stateMachine.setInterpretationFixture();
      }

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

      stateMachine.validateBallot();
    },

    invalidateBallot(): void {
      assert(stateMachine);

      stateMachine.invalidateBallot();
    },

    async confirmInvalidateBallot(): Promise<void> {
      assert(stateMachine);

      await logger.log(LogEventId.BallotInvalidated, 'poll_worker');

      stateMachine.confirmInvalidateBallot();
    },

    async confirmBallotBoxEmptied(): Promise<void> {
      assert(stateMachine);

      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace)
      );
      assert(isPollWorkerAuth(authStatus), 'Expected pollworker auth');

      workspace.store.setBallotsCastSinceLastBoxChange(0);
      stateMachine.confirmBallotBoxEmptied();

      await logger.log(LogEventId.BallotBoxEmptied, 'poll_worker');
    },

    ...createUiStringsApi({
      logger,
      store: workspace.store.getUiStringsStore(),
    }),

    ...createSystemCallApi({
      usbDrive,
      logger,
      machineId: getMachineConfig().machineId,
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
              return LogEventId.ResetPollsToPaused;
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

      await logger.logAsCurrentRole(logEvent, { disposition: 'success' });
    },

    setTestMode(input: { isTestMode: boolean }) {
      store.setTestMode(input.isTestMode);
      store.setPollsState('polls_closed_initial');
      store.setBallotsPrintedCount(0);
    },

    async setPrecinctSelection(input: {
      precinctSelection: PrecinctSelection;
    }): Promise<void> {
      const electionDefinition = store.getElectionDefinition();
      assert(electionDefinition);
      store.setPrecinctSelection(input.precinctSelection);
      store.setBallotsPrintedCount(0);
      await logger.logAsCurrentRole(LogEventId.PrecinctConfigurationChanged, {
        disposition: 'success',
        message: `User set the precinct for the machine to ${getPrecinctSelectionName(
          electionDefinition.election.precincts,
          input.precinctSelection
        )}`,
      });
    },

    getElectionState(): ElectionState {
      return {
        precinctSelection: store.getPrecinctSelection(),
        ballotsPrintedCount: store.getBallotsPrintedCount(),
        isTestMode: store.getTestMode(),
        pollsState: store.getPollsState(),
      };
    },

    isPatDeviceConnected(): boolean {
      if (!stateMachine) {
        return false;
      }

      return stateMachine.isPatDeviceConnected();
    },

    getApplicationDiskSpaceSummary(): Promise<DiskSpaceSummary> {
      return workspace.getDiskSpaceSummary();
    },

    addDiagnosticRecord(input: Omit<DiagnosticRecord, 'timestamp'>): void {
      store.addDiagnosticRecord(input);
      void logger.logAsCurrentRole(LogEventId.DiagnosticComplete, {
        disposition: input.outcome === 'pass' ? 'success' : 'failure',
        message: `Diagnostic (${input.type}) completed with outcome: ${input.outcome}.`,
        type: input.type,
      });
    },

    getMostRecentAccessibleControllerDiagnostic(): DiagnosticRecord | null {
      return (
        store.getMostRecentDiagnosticRecord(
          'mark-scan-accessible-controller'
        ) ?? null
      );
    },

    getIsAccessibleControllerInputDetected(): Promise<boolean> {
      return isAccessibleControllerDaemonRunning();
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
  useDevDockRouter(app, express, 'mark-scan');
  return app;
}
