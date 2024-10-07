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
import {
  isElectionManagerAuth,
  isCardlessVoterAuth,
  isPollWorkerAuth,
  isSystemAdministratorAuth,
  isVendorAuth,
} from '@votingworks/utils';
import {
  InvalidCardScreen,
  SetupCardReaderPage,
  UnlockMachineScreen,
  VendorScreen,
  VoterSettingsManagerContext,
  useAudioControls,
  useLanguageControls,
} from '@votingworks/ui';

import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import {
  mergeMsEitherNeitherContests,
  useBallotStyleManager,
  useSessionSettingsManager,
} from '@votingworks/mark-flow-ui';
import type {
  ElectionState,
  SimpleServerStatus,
} from '@votingworks/mark-scan-backend';
import {
  checkPin,
  endCardlessVoterSession,
  getAuthStatus,
  getElectionRecord,
  getElectionState,
  getMachineConfig,
  getStateMachineState,
  getUsbDriveStatus,
  setPollsState,
  startCardlessVoterSession,
  updateCardlessVoterBallotStyle,
  unconfigureMachine,
  systemCallApi,
  useApiClient,
} from './api';

import { handleKeyboardEvent } from './lib/assistive_technology';
import { AdminScreen } from './pages/admin_screen';
import { InsertCardScreen } from './pages/insert_card_screen';
import { PollWorkerScreen } from './pages/poll_worker_screen';
import { SetupPowerPage } from './pages/setup_power_page';
import { UnconfiguredScreen } from './pages/unconfigured_screen';
import { SystemAdministratorScreen } from './pages/system_administrator_screen';
import { UnconfiguredElectionScreenWrapper } from './pages/unconfigured_election_screen_wrapper';
import { JammedPage } from './pages/jammed_page';
import { JamClearedPage } from './pages/jam_cleared_page';
import { BallotInvalidatedPage } from './pages/ballot_invalidated_page';
import { BlankPageInterpretationPage } from './pages/blank_page_interpretation_page';
import { PaperReloadedPage } from './pages/paper_reloaded_page';
import { CastingBallotPage } from './pages/casting_ballot_page';
import { BallotSuccessfullyCastPage } from './pages/ballot_successfully_cast_page';
import { EmptyBallotBoxPage } from './pages/empty_ballot_box_page';
import { PollWorkerAuthEndedUnexpectedlyPage } from './pages/poll_worker_auth_ended_unexpectedly_page';
import { LOW_BATTERY_THRESHOLD } from './constants';
import { VoterFlow } from './voter_flow';
import { NoPaperHandlerPage } from './pages/no_paper_handler_page';
import { ScannerOpenAlarmScreen } from './pages/scanner_open_alarm_screen';

/**
 * These states require the poll worker to stay logged in until the voter
 * session is fully started.
 *
 * If the card is removed at any point while in these states, we reset the
 * session.
 *
 * These are technically handled in the backend state machine, but need to be
 * handled client-side as well for when the auth change is detected before the
 * next state machine state poll request reflects it.
 */
export const POLL_WORKER_AUTH_REQUIRED_STATES: Readonly<
  Set<SimpleServerStatus>
> = new Set<SimpleServerStatus>([
  'inserted_invalid_new_sheet',
  'inserted_preprinted_ballot',
  'loading_new_sheet',
  'loading_paper',
  'validating_new_sheet',
]);

interface VotingState {
  votes?: VotesDict;
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
  | { type: 'setVotes'; votes: VotesDict }
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
    case 'setVotes': {
      return {
        ...state,
        votes: { ...action.votes },
      };
    }
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

export function AppRoot(): JSX.Element | null {
  const [votingState, dispatchVotingState] = useReducer(
    votingStateReducer,
    initialVotingState
  );
  const { votes } = votingState;

  const history = useHistory();

  const voterSettingsManager = React.useContext(VoterSettingsManagerContext);
  const { reset: resetAudioSettings } = useAudioControls();
  const { reset: resetLanguage } = useLanguageControls();

  const apiClient = useApiClient();

  const machineConfigQuery = getMachineConfig.useQuery();
  const batteryQuery = systemCallApi.getBatteryInfo.useQuery();

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
  const endCardlessVoterSessionMutateAsync =
    endCardlessVoterSessionMutation.mutateAsync;
  const unconfigureMachineMutation = unconfigureMachine.useMutation();
  const unconfigureMachineMutateAsync = unconfigureMachineMutation.mutateAsync;
  const setPollsStateMutation = setPollsState.useMutation();
  const setPollsStateMutateAsync = setPollsStateMutation.mutateAsync;

  const getElectionRecordQuery = getElectionRecord.useQuery();
  const { electionDefinition, electionPackageHash } =
    getElectionRecordQuery.data ?? {};

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
    electionDefinition?.election && ballotStyleId
      ? getBallotStyle({
          ballotStyleId,
          election: electionDefinition.election,
        })
      : undefined;
  const contests =
    electionDefinition?.election && ballotStyle
      ? mergeMsEitherNeitherContests(
          getContests({
            election: electionDefinition.election,
            ballotStyle,
          })
        )
      : [];

  const { onSessionEnd } = useSessionSettingsManager({ authStatus });

  const resetBallot = useCallback(
    (newShowPostVotingInstructions?: boolean) => {
      dispatchVotingState({
        type: 'resetBallot',
      });
      history.push('/');

      if (!newShowPostVotingInstructions) {
        // [VVSG 2.0 7.1-A] Reset to default settings when voter is done marking
        // their ballot:
        voterSettingsManager.resetThemes();
        resetAudioSettings();
        resetLanguage();
      }

      onSessionEnd();
    },
    [
      history,
      voterSettingsManager,
      resetAudioSettings,
      resetLanguage,
      onSessionEnd,
    ]
  );

  const unconfigure = useCallback(async () => {
    await unconfigureMachineMutateAsync();
    dispatchVotingState({ type: 'unconfigure' });
    history.push('/');
  }, [history, unconfigureMachineMutateAsync]);

  const setVotes = useCallback((v: VotesDict) => {
    dispatchVotingState({ type: 'setVotes', votes: v });
  }, []);

  const updateVote = useCallback((contestId: ContestId, vote: OptionalVote) => {
    dispatchVotingState({ type: 'updateVote', contestId, vote });
  }, []);

  const resetPollsToPaused = useCallback(async () => {
    try {
      await setPollsStateMutateAsync({
        pollsState: 'polls_paused',
      });
    } catch {
      // Handled by default query client error handling
    }
  }, [setPollsStateMutateAsync]);

  const activateCardlessBallot = useCallback(
    (sessionPrecinctId: PrecinctId, sessionBallotStyleId: BallotStyleId) => {
      assert(isPollWorkerAuth(authStatus));

      resetBallot();

      startCardlessVoterSessionMutate({
        ballotStyleId: sessionBallotStyleId,
        precinctId: sessionPrecinctId,
      });
    },
    [authStatus, resetBallot, startCardlessVoterSessionMutate]
  );

  useEffect(() => {
    function resetBallotOnLogout() {
      if (!electionStateQuery.isSuccess) return;
      if (
        authStatus.status === 'logged_out' &&
        (authStatus.reason === 'no_card' ||
          authStatus.reason === 'session_expired')
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

  useBallotStyleManager({
    currentBallotStyleId: ballotStyleId,
    electionDefinition,
    updateCardlessVoterBallotStyle:
      updateCardlessVoterBallotStyle.useMutation().mutate,
  });

  if (
    !machineConfigQuery.isSuccess ||
    !authStatusQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !getStateMachineStateQuery.isSuccess ||
    !electionStateQuery.isSuccess ||
    !batteryQuery.isSuccess
  ) {
    return null;
  }
  const machineConfig = machineConfigQuery.data;
  const battery = batteryQuery.data;
  const usbDriveStatus = usbDriveStatusQuery.data;

  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'no_card_reader'
  ) {
    return <SetupCardReaderPage />;
  }

  if (stateMachineState === 'cover_open_unauthorized') {
    return <ScannerOpenAlarmScreen />;
  }

  if (stateMachineState === 'no_hardware') {
    return <NoPaperHandlerPage />;
  }

  if (battery && battery.level < LOW_BATTERY_THRESHOLD && battery.discharging) {
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

  if (
    authStatus.status === 'logged_out' &&
    !['no_card', 'session_expired'].includes(authStatus.reason)
  ) {
    return (
      <InvalidCardScreen
        reasonAndContext={authStatus}
        recommendedAction="Remove the card to continue."
      />
    );
  }

  if (isVendorAuth(authStatus)) {
    return (
      <VendorScreen rebootToVendorMenu={() => apiClient.rebootToVendorMenu()} />
    );
  }

  if (isSystemAdministratorAuth(authStatus)) {
    return (
      <SystemAdministratorScreen
        unconfigureMachine={unconfigure}
        isMachineConfigured={Boolean(electionDefinition)}
        resetPollsToPaused={
          pollsState === 'polls_closed_final' ? resetPollsToPaused : undefined
        }
        usbDriveStatus={usbDriveStatus}
      />
    );
  }

  if (isElectionManagerAuth(authStatus)) {
    if (!electionDefinition) {
      return <UnconfiguredElectionScreenWrapper />;
    }

    return (
      <AdminScreen
        appPrecinct={precinctSelection}
        ballotsPrintedCount={ballotsPrintedCount}
        electionDefinition={electionDefinition}
        electionPackageHash={assertDefined(electionPackageHash)}
        isTestMode={isTestMode}
        unconfigure={unconfigure}
        machineConfig={machineConfig}
        pollsState={pollsState}
        usbDriveStatus={usbDriveStatus}
      />
    );
  }

  if (stateMachineState === 'jammed') {
    return <JammedPage authStatus={authStatus} votes={votes} />;
  }
  if (
    stateMachineState === 'jam_cleared' ||
    stateMachineState === 'resetting_state_machine_after_jam' ||
    stateMachineState === 'accepting_paper_after_jam' ||
    stateMachineState === 'loading_paper_after_jam'
  ) {
    return (
      <JamClearedPage
        authStatus={authStatus}
        stateMachineState={stateMachineState}
      />
    );
  }

  if (
    stateMachineState === 'poll_worker_auth_ended_unexpectedly' ||
    // Handle when the frontend auth state is up to date but the state machine state is not
    (POLL_WORKER_AUTH_REQUIRED_STATES.has(stateMachineState) &&
      (isCardlessVoterAuth(authStatus) || authStatus.status === 'logged_out'))
  ) {
    return <PollWorkerAuthEndedUnexpectedlyPage />;
  }

  if (electionDefinition && precinctSelection) {
    if (stateMachineState === 'empty_ballot_box') {
      return <EmptyBallotBoxPage authStatus={authStatus} />;
    }

    if (stateMachineState === 'ejecting_to_rear') {
      return <CastingBallotPage />;
    }

    if (
      stateMachineState === 'ballot_accepted' ||
      stateMachineState === 'resetting_state_machine_after_success'
    ) {
      return <BallotSuccessfullyCastPage />;
    }

    if (isPollWorkerAuth(authStatus) || isCardlessVoterAuth(authStatus)) {
      if (stateMachineState === 'blank_page_interpretation') {
        // Blank page interpretation handling must take priority over PollWorkerScreen.
        // PollWorkerScreen will warn that votes exist in ballot state, but preserving
        // ballot state is the desired behavior when handling blank page interpretations.
        return <BlankPageInterpretationPage authStatus={authStatus} />;
      }

      if (
        stateMachineState ===
          'waiting_for_invalidated_ballot_confirmation.paper_present' ||
        stateMachineState ===
          'waiting_for_invalidated_ballot_confirmation.paper_absent'
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
    }

    if (isPollWorkerAuth(authStatus)) {
      if (stateMachineState === 'paper_reloaded') {
        return <PaperReloadedPage votesSelected={!!votes} />;
      }

      return (
        <PollWorkerScreen
          pollWorkerAuth={authStatus}
          activateCardlessVoterSession={activateCardlessBallot}
          electionDefinition={electionDefinition}
          electionPackageHash={assertDefined(electionPackageHash)}
          isLiveMode={!isTestMode}
          pollsState={pollsState}
          ballotsPrintedCount={ballotsPrintedCount}
          machineConfig={machineConfig}
          hasVotes={!!votes}
          precinctSelection={precinctSelection}
          setVotes={setVotes}
        />
      );
    }

    if (pollsState === 'polls_open') {
      if (
        isCardlessVoterAuth(authStatus) &&
        // Handle states that expect poll worker auth. If the frontend sees one of these states but has cardless voter auth,
        // it means the state hasn't caught up to auth changes. We check that edge case here to avoid flicker eg.
        // rendering the ballot briefly before rendering the correct "Insert Card" screen.
        // This problem is caused by conditioning on auth in both the frontend and backend. The long term fix is to
        // move auth entirely to the backend.
        // https://github.com/votingworks/vxsuite/issues/3985
        stateMachineState !== 'accepting_paper' &&
        stateMachineState !== 'not_accepting_paper'
      ) {
        return (
          <VoterFlow
            ballotStyleId={ballotStyleId}
            contests={contests}
            electionDefinition={electionDefinition}
            endVoterSession={endVoterSession}
            isLiveMode={!isTestMode}
            machineConfig={machineConfig}
            precinctId={precinctId}
            resetBallot={resetBallot}
            stateMachineState={stateMachineState}
            updateVote={updateVote}
            votes={votes ?? blankBallotVotes}
          />
        );
      }
    }

    return (
      <InsertCardScreen
        appPrecinct={precinctSelection}
        electionDefinition={electionDefinition}
        electionPackageHash={assertDefined(electionPackageHash)}
        showNoChargerAttachedWarning={!!battery && battery.discharging}
        isLiveMode={!isTestMode}
        pollsState={pollsState}
      />
    );
  }

  return <UnconfiguredScreen />;
}
