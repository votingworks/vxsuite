import React, { useCallback, useEffect, useReducer, useRef } from 'react';
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

import Gamepad from 'react-gamepad';
import { useHistory } from 'react-router-dom';
import { IdleTimerProvider } from 'react-idle-timer';
import {
  Hardware,
  isElectionManagerAuth,
  isCardlessVoterAuth,
  isPollWorkerAuth,
  isSystemAdministratorAuth,
  randomBallotId,
} from '@votingworks/utils';

import { BaseLogger } from '@votingworks/logging';

import {
  SetupCardReaderPage,
  useDevices,
  usePrevious,
  UnlockMachineScreen,
  VoterSettingsManagerContext,
  useAudioControls,
  useLanguageControls,
} from '@votingworks/ui';

import { assert, throwIllegalValue } from '@votingworks/basics';
import {
  mergeMsEitherNeitherContests,
  CastBallotPage,
  useSessionSettingsManager,
  useBallotStyleManager,
} from '@votingworks/mark-flow-ui';
import type { ElectionState } from '@votingworks/mark-backend';
import {
  checkPin,
  endCardlessVoterSession,
  getAuthStatus,
  getElectionDefinition,
  getMachineConfig,
  getUsbDriveStatus,
  getElectionState,
  incrementBallotsPrintedCount,
  setPollsState,
  startCardlessVoterSession,
  unconfigureMachine,
  updateCardlessVoterBallotStyle,
} from './api';

import { Ballot } from './components/ballot';
import * as GLOBALS from './config/globals';
import { BallotContext } from './contexts/ballot_context';
import {
  handleGamepadButtonDown,
  handleGamepadKeyboardEvent,
} from './lib/gamepad';
import { AdminScreen } from './pages/admin_screen';
import { InsertCardScreen } from './pages/insert_card_screen';
import { PollWorkerScreen } from './pages/poll_worker_screen';
import { SetupPrinterPage } from './pages/setup_printer_page';
import { SetupPowerPage } from './pages/setup_power_page';
import { UnconfiguredScreen } from './pages/unconfigured_screen';
import { WrongElectionScreen } from './pages/wrong_election_screen';
import { ReplaceElectionScreen } from './pages/replace_election_screen';
import { CardErrorScreen } from './pages/card_error_screen';
import { SystemAdministratorScreen } from './pages/system_administrator_screen';
import { UnconfiguredElectionScreenWrapper } from './pages/unconfigured_election_screen_wrapper';

export interface VotingState {
  votes?: VotesDict;
  showPostVotingInstructions?: boolean;
}

export interface Props {
  hardware: Hardware;
  reload: VoidFunction;
  logger: BaseLogger;
}

export const stateStorageKey = 'state';
export const blankBallotVotes: VotesDict = {};

export const initialElectionState: Readonly<ElectionState> = {
  precinctSelection: undefined,
  ballotsPrintedCount: 0,
  isTestMode: true,
  pollsState: 'polls_closed_initial',
};

const initialVotingState: Readonly<VotingState> = {
  votes: undefined,
  showPostVotingInstructions: undefined,
};

// Sets State. All side effects done outside: storage, fetching, etc
type VotingAction =
  | { type: 'unconfigure' }
  | { type: 'updateVote'; contestId: ContestId; vote: OptionalVote }
  | { type: 'resetBallot'; showPostVotingInstructions?: boolean };

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
        showPostVotingInstructions: action.showPostVotingInstructions,
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
  const PostVotingInstructionsTimeout = useRef(0);
  const [votingState, dispatchVotingState] = useReducer(
    votingStateReducer,
    initialVotingState
  );
  const { showPostVotingInstructions, votes } = votingState;

  const history = useHistory();

  const voterSettingsManager = React.useContext(VoterSettingsManagerContext);
  const { reset: resetAudioSettings } = useAudioControls();
  const { reset: resetLanguage } = useLanguageControls();

  const machineConfigQuery = getMachineConfig.useQuery();

  const devices = useDevices({ hardware, logger });
  const { printer: printerInfo, accessibleController, computer } = devices;
  const hasPrinterAttached = printerInfo !== undefined;
  const previousHasPrinterAttached = usePrevious(hasPrinterAttached);

  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const authStatusQuery = getAuthStatus.useQuery();
  const authStatus = authStatusQuery.isSuccess
    ? authStatusQuery.data
    : InsertedSmartCardAuth.DEFAULT_AUTH_STATUS;

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
  const incrementBallotsPrintedCountMutation =
    incrementBallotsPrintedCount.useMutation();
  const incrementBallotsPrintedCountMutate =
    incrementBallotsPrintedCountMutation.mutate;
  const setPollsStateMutation = setPollsState.useMutation();
  const setPollsStateMutateAsync = setPollsStateMutation.mutateAsync;

  const getElectionDefinitionQuery = getElectionDefinition.useQuery();
  const optionalElectionDefinition = getElectionDefinitionQuery.data;

  const electionStateQuery = getElectionState.useQuery();
  const {
    precinctSelection: appPrecinct,
    ballotsPrintedCount,
    isTestMode,
    pollsState,
  } = electionStateQuery.isSuccess
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
        showPostVotingInstructions: newShowPostVotingInstructions,
      });
      history.push('/');

      if (!newShowPostVotingInstructions) {
        // [VVSG 2.0 7.1-A] Reset to default settings when voter is done marking
        // their ballot:
        voterSettingsManager.resetThemes();
        resetAudioSettings();
        resetLanguage();
      }
    },
    [history, voterSettingsManager, resetAudioSettings, resetLanguage]
  );

  const hidePostVotingInstructions = useCallback(() => {
    clearTimeout(PostVotingInstructionsTimeout.current);
    endCardlessVoterSessionMutate(undefined, {
      onSuccess() {
        resetBallot();
      },
    });
  }, [endCardlessVoterSessionMutate, resetBallot]);

  // Hide Verify and Scan Instructions
  useEffect(() => {
    if (showPostVotingInstructions) {
      PostVotingInstructionsTimeout.current = window.setTimeout(
        hidePostVotingInstructions,
        GLOBALS.BALLOT_INSTRUCTIONS_TIMEOUT_SECONDS * 1000
      );
    }
    return () => {
      clearTimeout(PostVotingInstructionsTimeout.current);
    };
    /* We don't include hidePostVotingInstructions because it is updated
     * frequently due to its dependency on auth, which causes this effect to
     * run/cleanup,clearing the timeout.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPostVotingInstructions]);

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

  const updateTally = useCallback(() => {
    incrementBallotsPrintedCountMutate();
  }, [incrementBallotsPrintedCountMutate]);

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
  }, [authStatus, resetBallot, electionStateQuery.isSuccess]);

  const endVoterSession = useCallback(async () => {
    try {
      await endCardlessVoterSessionMutateAsync();
    } catch {
      // Handled by default query client error handling
    }
  }, [endCardlessVoterSessionMutateAsync]);

  // Handle Hardware Observer Subscription
  useEffect(() => {
    function resetBallotOnPrinterDetach() {
      if (previousHasPrinterAttached && !hasPrinterAttached) {
        resetBallot();
      }
    }
    void resetBallotOnPrinterDetach();
  }, [previousHasPrinterAttached, hasPrinterAttached, resetBallot]);

  // Handle Keyboard Input
  useEffect(() => {
    document.documentElement.setAttribute(
      'data-useragent',
      navigator.userAgent
    );
    document.addEventListener('keydown', handleGamepadKeyboardEvent);
    return () => {
      document.removeEventListener('keydown', handleGamepadKeyboardEvent);
    };
  }, []);

  useSessionSettingsManager({ authStatus, votes });

  useBallotStyleManager({
    currentBallotStyleId: ballotStyleId,
    electionDefinition: optionalElectionDefinition,
    updateCardlessVoterBallotStyle:
      updateCardlessVoterBallotStyle.useMutation().mutate,
  });

  if (
    !machineConfigQuery.isSuccess ||
    !authStatusQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess
  ) {
    return null;
  }
  const usbDriveStatus = usbDriveStatusQuery.data;
  const machineConfig = machineConfigQuery.data;

  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'no_card_reader'
  ) {
    return <SetupCardReaderPage />;
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
          appPrecinct={appPrecinct}
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
        appPrecinct={appPrecinct}
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
  if (optionalElectionDefinition && appPrecinct) {
    if (!hasPrinterAttached) {
      return <SetupPrinterPage />;
    }
    if (
      authStatus.status === 'logged_out' &&
      authStatus.reason === 'wrong_election' &&
      authStatus.cardUserRole === 'poll_worker'
    ) {
      return <WrongElectionScreen />;
    }
    if (isPollWorkerAuth(authStatus)) {
      return (
        <PollWorkerScreen
          pollWorkerAuth={authStatus}
          activateCardlessVoterSession={activateCardlessBallot}
          resetCardlessVoterSession={resetCardlessBallot}
          appPrecinct={appPrecinct}
          electionDefinition={optionalElectionDefinition}
          isLiveMode={!isTestMode}
          pollsState={pollsState}
          ballotsPrintedCount={ballotsPrintedCount}
          machineConfig={machineConfig}
          hardware={hardware}
          devices={devices}
          hasVotes={!!votes}
          reload={reload}
        />
      );
    }
    if (pollsState === 'polls_open' && showPostVotingInstructions) {
      return (
        <CastBallotPage
          hidePostVotingInstructions={hidePostVotingInstructions}
        />
      );
    }
    if (pollsState === 'polls_open') {
      if (isCardlessVoterAuth(authStatus)) {
        return (
          <Gamepad onButtonDown={handleGamepadButtonDown}>
            <BallotContext.Provider
              value={{
                machineConfig,
                precinctId,
                ballotStyleId,
                contests,
                electionDefinition: optionalElectionDefinition,
                generateBallotId: randomBallotId,
                updateTally,
                isCardlessVoter: isCardlessVoterAuth(authStatus),
                isLiveMode: !isTestMode,
                endVoterSession,
                resetBallot,
                updateVote,
                votes: votes ?? blankBallotVotes,
              }}
            >
              <Ballot />
            </BallotContext.Provider>
          </Gamepad>
        );
      }
    }

    return (
      <IdleTimerProvider
        onIdle={() => /* istanbul ignore next */ window.kiosk?.quit()}
        timeout={GLOBALS.QUIT_KIOSK_IDLE_SECONDS * 1000}
      >
        <InsertCardScreen
          appPrecinct={appPrecinct}
          electionDefinition={optionalElectionDefinition}
          showNoAccessibleControllerWarning={!accessibleController}
          showNoChargerAttachedWarning={!computer.batteryIsCharging}
          isLiveMode={!isTestMode}
          pollsState={pollsState}
        />
      </IdleTimerProvider>
    );
  }
  return <UnconfiguredScreen />;
}
