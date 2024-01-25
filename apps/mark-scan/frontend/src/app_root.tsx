import React, { useCallback, useEffect, useReducer } from 'react';
import {
  OptionalVote,
  VotesDict,
  getBallotStyle,
  getContests,
  ContestId,
  PrecinctId,
  BallotStyleId,
  InsertedSmartCardAuth,
} from '@votingworks/types';

import { useHistory } from 'react-router-dom';
import { IdleTimerProvider } from 'react-idle-timer';
import {
  Hardware,
  isElectionManagerAuth,
  isCardlessVoterAuth,
  isPollWorkerAuth,
  isSystemAdministratorAuth,
  randomBallotId,
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';

import { Logger } from '@votingworks/logging';

import {
  SetupCardReaderPage,
  useDevices,
  UnlockMachineScreen,
  DisplaySettingsManagerContext,
} from '@votingworks/ui';

import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  mergeMsEitherNeitherContests,
  useBallotStyleManager,
  useDisplaySettingsManager,
} from '@votingworks/mark-flow-ui';
import type { ElectionState } from '@votingworks/mark-scan-backend';
import {
  checkPin,
  endCardlessVoterSession,
  getAuthStatus,
  getElectionDefinition,
  getElectionState,
  getMachineConfig,
  getStateMachineState,
  getUsbDriveStatus,
  setPollsState,
  startCardlessVoterSession,
  updateCardlessVoterBallotStyle,
  unconfigureMachine,
} from './api';

import { Ballot } from './components/ballot';
import * as GLOBALS from './config/globals';
import { BallotContext } from './contexts/ballot_context';
import { handleKeyboardEvent } from './lib/assistive_technology';
import { AdminScreen } from './pages/admin_screen';
import { InsertCardScreen } from './pages/insert_card_screen';
import { PollWorkerScreen } from './pages/poll_worker_screen';
import { SetupPowerPage } from './pages/setup_power_page';
import { UnconfiguredScreen } from './pages/unconfigured_screen';
import { WrongElectionScreen } from './pages/wrong_election_screen';
import { ReplaceElectionScreen } from './pages/replace_election_screen';
import { CardErrorScreen } from './pages/card_error_screen';
import { SystemAdministratorScreen } from './pages/system_administrator_screen';
import { UnconfiguredElectionScreenWrapper } from './pages/unconfigured_election_screen_wrapper';
import { NoPaperHandlerPage } from './pages/no_paper_handler_page';
import { JammedPage } from './pages/jammed_page';
import { JamClearedPage } from './pages/jam_cleared_page';
import { ValidateBallotPage } from './pages/validate_ballot_page';
import { BallotInvalidatedPage } from './pages/ballot_invalidated_page';
import { BlankPageInterpretationPage } from './pages/blank_page_interpretation_page';
import { PaperReloadedPage } from './pages/paper_reloaded_page';
import { PatDeviceCalibrationPage } from './pages/pat_device_identification/pat_device_calibration_page';
import { CastingBallotPage } from './pages/casting_ballot_page';

interface VotingState {
  votes?: VotesDict;
}

export interface Props {
  hardware: Hardware;
  reload: VoidFunction;
  logger: Logger;
}

export const blankBallotVotes: VotesDict = {};

export const initialElectionState: Readonly<ElectionState> = {
  precinctSelection: undefined,
  ballotsPrintedCount: 0,
  isTestMode: true,
  pollsState: 'polls_closed_initial',
};

const initialVotingState: Readonly<VotingState> = {
  votes: undefined,
};

// Sets State. All side effects done outside: storage, fetching, etc
type VotingAction =
  | { type: 'unconfigure' }
  | { type: 'updateVote'; contestId: ContestId; vote: OptionalVote }
  | { type: 'resetBallot' };

function votingStateReducer(
  state: VotingState,
  action: VotingAction
): VotingState {
  switch (action.type) {
    case 'unconfigure':
      return {
        ...state,
        ...initialVotingState,
      };
    case 'updateVote': {
      return {
        ...state,
        votes: {
          ...(state.votes ?? {}),
          [action.contestId]: action.vote,
        },
      };
    }
    case 'resetBallot':
      return {
        ...state,
        ...initialVotingState,
      };
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(action);
  }
}

export function AppRoot({
  hardware,
  reload,
  logger,
}: Props): JSX.Element | null {
  const [votingState, dispatchVotingState] = useReducer(
    votingStateReducer,
    initialVotingState
  );
  const { votes } = votingState;

  const history = useHistory();

  const displaySettingsManager = React.useContext(
    DisplaySettingsManagerContext
  );

  const machineConfigQuery = getMachineConfig.useQuery();

  const devices = useDevices({ hardware, logger });
  const { computer } = devices;

  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const authStatusQuery = getAuthStatus.useQuery();
  const authStatus = authStatusQuery.isSuccess
    ? authStatusQuery.data
    : InsertedSmartCardAuth.DEFAULT_AUTH_STATUS;

  const getStateMachineStateQuery = getStateMachineState.useQuery();
  const stateMachineState = getStateMachineStateQuery.isSuccess
    ? getStateMachineStateQuery.data
    : 'no_hardware';

  const checkPinMutation = checkPin.useMutation();
  const startCardlessVoterSessionMutation =
    startCardlessVoterSession.useMutation();
  const startCardlessVoterSessionMutate =
    startCardlessVoterSessionMutation.mutate;
  const endCardlessVoterSessionMutation = endCardlessVoterSession.useMutation();
  const endCardlessVoterSessionMutate = endCardlessVoterSessionMutation.mutate;
  const endCardlessVoterSessionMutateAsync =
    endCardlessVoterSessionMutation.mutateAsync;
  const unconfigureMachineMutation = unconfigureMachine.useMutation();
  const unconfigureMachineMutateAsync = unconfigureMachineMutation.mutateAsync;
  const setPollsStateMutation = setPollsState.useMutation();
  const setPollsStateMutateAsync = setPollsStateMutation.mutateAsync;

  const getElectionDefinitionQuery = getElectionDefinition.useQuery();
  const optionalElectionDefinition = getElectionDefinitionQuery.data;

  const electionStateQuery = getElectionState.useQuery();
  const { precinctSelection, ballotsPrintedCount, isTestMode, pollsState } =
    electionStateQuery.isSuccess
      ? electionStateQuery.data
      : initialElectionState;

  const precinctId = isCardlessVoterAuth(authStatus)
    ? authStatus.user.precinctId
    : undefined;
  const ballotStyleId = isCardlessVoterAuth(authStatus)
    ? authStatus.user.ballotStyleId
    : undefined;
  const ballotStyle =
    optionalElectionDefinition?.election && ballotStyleId
      ? getBallotStyle({
          ballotStyleId,
          election: optionalElectionDefinition.election,
        })
      : undefined;
  const contests =
    optionalElectionDefinition?.election && ballotStyle
      ? mergeMsEitherNeitherContests(
          getContests({
            election: optionalElectionDefinition.election,
            ballotStyle,
          })
        )
      : [];

  const resetBallot = useCallback(
    (newShowPostVotingInstructions?: boolean) => {
      dispatchVotingState({
        type: 'resetBallot',
      });
      history.push('/');

      if (!newShowPostVotingInstructions) {
        // [VVSG 2.0 7.1-A] Reset to default theme when voter is done marking
        // their ballot:
        displaySettingsManager.resetThemes();
      }
    },
    [history, displaySettingsManager]
  );

  const unconfigure = useCallback(async () => {
    await unconfigureMachineMutateAsync();
    dispatchVotingState({ type: 'unconfigure' });
    history.push('/');
  }, [history, unconfigureMachineMutateAsync]);

  const updateVote = useCallback((contestId: ContestId, vote: OptionalVote) => {
    dispatchVotingState({ type: 'updateVote', contestId, vote });
  }, []);

  const resetPollsToPaused = useCallback(async () => {
    try {
      await setPollsStateMutateAsync({
        pollsState: 'polls_paused',
      });
    } catch (error) {
      // Handled by default query client error handling
    }
  }, [setPollsStateMutateAsync]);

  const activateCardlessBallot = useCallback(
    (sessionPrecinctId: PrecinctId, sessionBallotStyleId: BallotStyleId) => {
      assert(isPollWorkerAuth(authStatus));
      startCardlessVoterSessionMutate(
        {
          ballotStyleId: sessionBallotStyleId,
          precinctId: sessionPrecinctId,
        },
        {
          onSuccess() {
            resetBallot();
          },
        }
      );
    },
    [authStatus, resetBallot, startCardlessVoterSessionMutate]
  );

  const resetCardlessBallot = useCallback(() => {
    assert(isPollWorkerAuth(authStatus));
    endCardlessVoterSessionMutate(undefined, {
      onSuccess() {
        history.push('/');
      },
    });
  }, [authStatus, endCardlessVoterSessionMutate, history]);

  useEffect(() => {
    function resetBallotOnLogout() {
      if (!electionStateQuery.isSuccess) return;
      if (
        authStatus.status === 'logged_out' &&
        authStatus.reason === 'no_card'
      ) {
        resetBallot();
      }
    }
    resetBallotOnLogout();
  }, [authStatus, electionStateQuery.isSuccess, resetBallot]);

  const endVoterSession = useCallback(async () => {
    try {
      await endCardlessVoterSessionMutateAsync();
    } catch {
      // Handled by default query client error handling
    }
  }, [endCardlessVoterSessionMutateAsync]);

  // Handle Keyboard Input
  useEffect(() => {
    document.documentElement.setAttribute(
      'data-useragent',
      navigator.userAgent
    );

    document.addEventListener('keydown', handleKeyboardEvent);

    return () => {
      document.removeEventListener('keydown', handleKeyboardEvent);
    };
  }, []);

  useDisplaySettingsManager({ authStatus, votes });

  useBallotStyleManager({
    currentBallotStyleId: ballotStyleId,
    electionDefinition: optionalElectionDefinition,
    updateCardlessVoterBallotStyle:
      updateCardlessVoterBallotStyle.useMutation().mutate,
  });

  if (
    !machineConfigQuery.isSuccess ||
    !authStatusQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !getStateMachineStateQuery.isSuccess ||
    !electionStateQuery.isSuccess
  ) {
    return null;
  }
  const machineConfig = machineConfigQuery.data;
  const usbDriveStatus = usbDriveStatusQuery.data;

  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'no_card_reader'
  ) {
    return <SetupCardReaderPage />;
  }

  if (
    stateMachineState === 'no_hardware' &&
    !isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.SKIP_PAPER_HANDLER_HARDWARE_CHECK
    )
  ) {
    return <NoPaperHandlerPage />;
  }

  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'card_error'
  ) {
    return <CardErrorScreen />;
  }
  if (computer.batteryIsLow && !computer.batteryIsCharging) {
    return <SetupPowerPage />;
  }
  if (authStatus.status === 'checking_pin') {
    return (
      <UnlockMachineScreen
        auth={authStatus}
        checkPin={async (pin) => {
          try {
            await checkPinMutation.mutateAsync({ pin });
          } catch {
            // Handled by default query client error handling
          }
        }}
      />
    );
  }

  if (isSystemAdministratorAuth(authStatus)) {
    return (
      <SystemAdministratorScreen
        logger={logger}
        unconfigureMachine={unconfigure}
        isMachineConfigured={Boolean(optionalElectionDefinition)}
        resetPollsToPaused={
          pollsState === 'polls_closed_final' ? resetPollsToPaused : undefined
        }
      />
    );
  }
  if (isElectionManagerAuth(authStatus)) {
    if (!optionalElectionDefinition) {
      return <UnconfiguredElectionScreenWrapper />;
    }

    // We prevent mismatch in {election package, auth} election hash at configuration time,
    // but mismatch may still occur if the user removes the matching card and inserts another
    // card with a mismatched election hash
    if (
      authStatus.user.electionHash !== optionalElectionDefinition.electionHash
    ) {
      return (
        <ReplaceElectionScreen
          appPrecinct={precinctSelection}
          ballotsPrintedCount={ballotsPrintedCount}
          authElectionHash={authStatus.user.electionHash}
          electionDefinition={optionalElectionDefinition}
          machineConfig={machineConfig}
          isLoading={unconfigureMachineMutation.isLoading}
          isError={unconfigureMachineMutation.isError}
        />
      );
    }

    return (
      <AdminScreen
        appPrecinct={precinctSelection}
        ballotsPrintedCount={ballotsPrintedCount}
        electionDefinition={optionalElectionDefinition}
        isTestMode={isTestMode}
        unconfigure={unconfigure}
        machineConfig={machineConfig}
        pollsState={pollsState}
        logger={logger}
        usbDriveStatus={usbDriveStatus}
      />
    );
  }

  if (stateMachineState === 'jammed') {
    return <JammedPage />;
  }
  if (
    stateMachineState === 'jam_cleared' ||
    stateMachineState === 'resetting_state_machine_after_jam'
  ) {
    return <JamClearedPage stateMachineState={stateMachineState} />;
  }

  if (optionalElectionDefinition && precinctSelection) {
    if (
      authStatus.status === 'logged_out' &&
      authStatus.reason === 'wrong_election' &&
      authStatus.cardUserRole === 'poll_worker'
    ) {
      return <WrongElectionScreen />;
    }

    if (isPollWorkerAuth(authStatus) || isCardlessVoterAuth(authStatus)) {
      if (stateMachineState === 'blank_page_interpretation') {
        // Blank page interpretation handling must take priority over PollWorkerScreen.
        // PollWorkerScreen will warn that votes exist in ballot state, but preserving
        // ballot state is the desired behavior when handling blank page interpretations.
        return <BlankPageInterpretationPage authStatus={authStatus} />;
      }

      if (stateMachineState === 'pat_device_connected') {
        return <PatDeviceCalibrationPage />;
      }
    }

    if (
      (isPollWorkerAuth(authStatus) || isCardlessVoterAuth(authStatus)) &&
      (stateMachineState ===
        'waiting_for_invalidated_ballot_confirmation.paper_present' ||
        stateMachineState ===
          'waiting_for_invalidated_ballot_confirmation.paper_absent')
    ) {
      return (
        <BallotInvalidatedPage
          authStatus={authStatus}
          paperPresent={
            stateMachineState ===
            'waiting_for_invalidated_ballot_confirmation.paper_present'
          }
        />
      );
    }

    if (isPollWorkerAuth(authStatus)) {
      if (stateMachineState === 'paper_reloaded') {
        return <PaperReloadedPage />;
      }

      return (
        <PollWorkerScreen
          pollWorkerAuth={authStatus}
          activateCardlessVoterSession={activateCardlessBallot}
          resetCardlessVoterSession={resetCardlessBallot}
          electionDefinition={optionalElectionDefinition}
          isLiveMode={!isTestMode}
          pollsState={pollsState}
          ballotsPrintedCount={ballotsPrintedCount}
          machineConfig={machineConfig}
          hardware={hardware}
          devices={devices}
          hasVotes={!!votes}
          reload={reload}
          precinctSelection={precinctSelection}
        />
      );
    }

    if (pollsState === 'polls_open') {
      if (isCardlessVoterAuth(authStatus)) {
        if (
          !isFeatureFlagEnabled(
            BooleanEnvironmentVariableName.SKIP_PAPER_HANDLER_HARDWARE_CHECK
          ) &&
          (stateMachineState === 'ejecting_to_rear' ||
            stateMachineState === 'resetting_state_machine_after_success' ||
            // Cardless voter auth is ended in the backend when the voting session ends but the frontend
            // may have a stale value. Cardless voter auth + 'not_accepting_paper' state means the frontend
            // is stale, so we want to render the previous loading screen until the frontend auth status updates.
            stateMachineState === 'not_accepting_paper')
        ) {
          return <CastingBallotPage />;
        }

        let ballotContextProviderChild = <Ballot />;
        // Pages that condition on state machine state aren't nested under Ballot because Ballot uses
        // frontend browser routing for flow control and is completely independent of the state machine.
        // We still want to nest some pages that condition on the state machine under BallotContext so we render them here.
        if (stateMachineState === 'presenting_ballot') {
          ballotContextProviderChild = <ValidateBallotPage />;
        }

        return (
          <BallotContext.Provider
            value={{
              machineConfig,
              precinctId,
              ballotStyleId,
              contests,
              electionDefinition: optionalElectionDefinition,
              generateBallotId: randomBallotId,
              isCardlessVoter: isCardlessVoterAuth(authStatus),
              isLiveMode: !isTestMode,
              endVoterSession,
              resetBallot,
              updateVote,
              votes: votes ?? blankBallotVotes,
            }}
          >
            {ballotContextProviderChild}
          </BallotContext.Provider>
        );
      }
    }

    return (
      <IdleTimerProvider
        onIdle={() => /* istanbul ignore next */ window.kiosk?.quit()}
        timeout={GLOBALS.QUIT_KIOSK_IDLE_SECONDS * 1000}
      >
        <InsertCardScreen
          appPrecinct={precinctSelection}
          electionDefinition={optionalElectionDefinition}
          showNoChargerAttachedWarning={!computer.batteryIsCharging}
          isLiveMode={!isTestMode}
          pollsState={pollsState}
        />
      </IdleTimerProvider>
    );
  }

  return <UnconfiguredScreen />;
}
