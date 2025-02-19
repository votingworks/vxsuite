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
  PrinterStatus,
} from '@votingworks/types';

import Gamepad from 'react-gamepad';
import { useHistory } from 'react-router-dom';
import {
  isElectionManagerAuth,
  isCardlessVoterAuth,
  isPollWorkerAuth,
  isSystemAdministratorAuth,
  randomBallotId,
  isVendorAuth,
} from '@votingworks/utils';

import {
  SetupCardReaderPage,
  UnlockMachineScreen,
  VoterSettingsManagerContext,
  useAudioControls,
  useLanguageControls,
  InvalidCardScreen,
  useQueryChangeListener,
  VendorScreen,
} from '@votingworks/ui';

import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
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
  getElectionRecord,
  getMachineConfig,
  getUsbDriveStatus,
  getElectionState,
  setPollsState,
  startCardlessVoterSession,
  unconfigureMachine,
  updateCardlessVoterBallotStyle,
  getPrinterStatus,
  systemCallApi,
  getAccessibleControllerConnected,
  useApiClient,
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
import { SystemAdministratorScreen } from './pages/system_administrator_screen';
import { UnconfiguredElectionScreenWrapper } from './pages/unconfigured_election_screen_wrapper';

export interface VotingState {
  votes?: VotesDict;
  showPostVotingInstructions?: boolean;
}

export interface Props {
  reload: VoidFunction;
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
    default: {
      /* istanbul ignore next - compile time check for completeness - @preserve */
      throwIllegalValue(action);
    }
  }
}

export function AppRoot({ reload }: Props): JSX.Element | null {
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

  const apiClient = useApiClient();

  const machineConfigQuery = getMachineConfig.useQuery();

  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const printerStatusQuery = getPrinterStatus.useQuery();
  const printerStatus: PrinterStatus = printerStatusQuery.isSuccess
    ? printerStatusQuery.data
    : { connected: false };
  const hasPrinterAttached = printerStatus.connected;
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const authStatusQuery = getAuthStatus.useQuery();
  const authStatus = authStatusQuery.isSuccess
    ? authStatusQuery.data
    : InsertedSmartCardAuth.DEFAULT_AUTH_STATUS;
  const accessibleControllerConnectedQuery =
    getAccessibleControllerConnected.useQuery();
  const accessibleControllerConnected = Boolean(
    accessibleControllerConnectedQuery.data
  );

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

  const getElectionRecordQuery = getElectionRecord.useQuery();
  const { electionDefinition, electionPackageHash } =
    getElectionRecordQuery.data ?? {};

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
    } catch {
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
        (authStatus.reason === 'no_card' ||
          authStatus.reason === 'session_expired')
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

  // Reset the ballot if the printer is disconnected mid-voting
  useQueryChangeListener(printerStatusQuery, {
    onChange: (currentPrinterStatus, previousPrinterStatus) => {
      if (previousPrinterStatus?.connected && !currentPrinterStatus.connected) {
        resetBallot();
      }
    },
  });

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
    !printerStatusQuery.isSuccess ||
    !batteryInfoQuery.isSuccess ||
    !accessibleControllerConnectedQuery.isSuccess
  ) {
    return null;
  }
  const usbDriveStatus = usbDriveStatusQuery.data;
  const machineConfig = machineConfigQuery.data;
  const batteryInfo = batteryInfoQuery.data;
  const batteryIsDischarging = batteryInfo ? batteryInfo.discharging : false;
  const batteryIsLow = batteryInfo
    ? batteryInfo.level < GLOBALS.LOW_BATTERY_THRESHOLD
    : false;

  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'no_card_reader'
  ) {
    return <SetupCardReaderPage />;
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

  if (batteryIsLow && batteryIsDischarging) {
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
        appPrecinct={appPrecinct}
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
  if (electionDefinition && appPrecinct) {
    if (!hasPrinterAttached) {
      return <SetupPrinterPage />;
    }

    if (isPollWorkerAuth(authStatus)) {
      return (
        <PollWorkerScreen
          pollWorkerAuth={authStatus}
          activateCardlessVoterSession={activateCardlessBallot}
          resetCardlessVoterSession={resetCardlessBallot}
          appPrecinct={appPrecinct}
          electionDefinition={electionDefinition}
          electionPackageHash={assertDefined(electionPackageHash)}
          isLiveMode={!isTestMode}
          pollsState={pollsState}
          ballotsPrintedCount={ballotsPrintedCount}
          machineConfig={machineConfig}
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
                electionDefinition,
                generateBallotId: randomBallotId,
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
      <InsertCardScreen
        appPrecinct={appPrecinct}
        electionDefinition={electionDefinition}
        electionPackageHash={assertDefined(electionPackageHash)}
        showNoAccessibleControllerWarning={!accessibleControllerConnected}
        showNoChargerAttachedWarning={batteryIsDischarging}
        isLiveMode={!isTestMode}
        pollsState={pollsState}
      />
    );
  }
  return <UnconfiguredScreen />;
}
