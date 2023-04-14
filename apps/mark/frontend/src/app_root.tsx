import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  ElectionDefinition,
  OptionalElectionDefinition,
  OptionalVote,
  VotesDict,
  getBallotStyle,
  getContests,
  ContestId,
  PrecinctId,
  BallotStyleId,
  PrecinctSelection,
  PollsState,
  InsertedSmartCardAuth,
} from '@votingworks/types';

import Gamepad from 'react-gamepad';
import { useHistory } from 'react-router-dom';
import { IdleTimerProvider } from 'react-idle-timer';
import {
  Storage,
  Hardware,
  singlePrecinctSelectionFor,
  makeAsync,
  isElectionManagerAuth,
  isCardlessVoterAuth,
  isPollWorkerAuth,
  isSystemAdministratorAuth,
  randomBallotId,
} from '@votingworks/utils';

import { LogEventId, Logger } from '@votingworks/logging';

import {
  SetupCardReaderPage,
  useDevices,
  usePrevious,
  useUsbDrive,
  UnlockMachineScreen,
  useQueryChangeListener,
} from '@votingworks/ui';

import { assert, Optional, throwIllegalValue } from '@votingworks/basics';
import {
  checkPin,
  endCardlessVoterSession,
  getAuthStatus,
  getElectionDefinition,
  getMachineConfig,
  startCardlessVoterSession,
  unconfigureMachine,
} from './api';

import { Ballot } from './components/ballot';
import * as GLOBALS from './config/globals';
import { PartialUserSettings, UserSettings } from './config/types';
import { BallotContext } from './contexts/ballot_context';
import {
  handleGamepadButtonDown,
  handleGamepadKeyboardEvent,
} from './lib/gamepad';
import { CastBallotPage } from './pages/cast_ballot_page';
import { AdminScreen } from './pages/admin_screen';
import { InsertCardScreen } from './pages/insert_card_screen';
import { PollWorkerScreen } from './pages/poll_worker_screen';
import { SetupPrinterPage } from './pages/setup_printer_page';
import { SetupPowerPage } from './pages/setup_power_page';
import { UnconfiguredScreen } from './pages/unconfigured_screen';
import { WrongElectionScreen } from './pages/wrong_election_screen';
import { ScreenReader } from './utils/ScreenReader';
import { ReplaceElectionScreen } from './pages/replace_election_screen';
import { CardErrorScreen } from './pages/card_error_screen';
import { SystemAdministratorScreen } from './pages/system_administrator_screen';
import { mergeMsEitherNeitherContests } from './utils/ms_either_neither_contests';
import { SessionTimeLimitTracker } from './components/session_time_limit_tracker';
import { UnconfiguredElectionScreenWrapper } from './pages/unconfigured_election_screen_wrapper';

interface UserState {
  userSettings: UserSettings;
  votes?: VotesDict;
  showPostVotingInstructions?: boolean;
}

interface SharedState {
  appPrecinct?: PrecinctSelection;
  ballotsPrintedCount: number;
  electionDefinition: OptionalElectionDefinition;
  isLiveMode: boolean;
  pollsState: PollsState;
}

interface OtherState {
  lastVoteUpdateAt: number;
  lastVoteSaveToCardAt: number;
  forceSaveVoteFlag: boolean;
  writingVoteToCard: boolean;
  initializedFromStorage: boolean;
}

export interface InitialUserState extends UserState, SharedState {}

export interface State extends InitialUserState, OtherState {}

export interface AppStorage {
  electionDefinition?: ElectionDefinition;
  state?: Partial<State>;
}
export interface Props {
  hardware: Hardware;
  storage: Storage;
  screenReader: ScreenReader;
  reload: VoidFunction;
  logger: Logger;
}

export const electionStorageKey = 'electionDefinition';
export const stateStorageKey = 'state';
export const blankBallotVotes: VotesDict = {};

const initialVoterState: Readonly<UserState> = {
  userSettings: GLOBALS.DEFAULT_USER_SETTINGS,
  votes: undefined,
  showPostVotingInstructions: undefined,
};

const initialSharedState: Readonly<SharedState> = {
  appPrecinct: undefined,
  ballotsPrintedCount: 0,
  electionDefinition: undefined,
  isLiveMode: false,
  pollsState: 'polls_closed_initial',
};

const initialOtherState: Readonly<OtherState> = {
  lastVoteUpdateAt: 0,
  lastVoteSaveToCardAt: 0,
  forceSaveVoteFlag: false,
  writingVoteToCard: false,
  initializedFromStorage: false,
};

const initialUserState: Readonly<InitialUserState> = {
  ...initialVoterState,
  ...initialSharedState,
};

const initialAppState: Readonly<State> = {
  ...initialUserState,
  ...initialOtherState,
};

// Sets State. All side effects done outside: storage, fetching, etc
type AppAction =
  | { type: 'updateLastVoteUpdateAt'; date: number }
  | { type: 'unconfigure' }
  | { type: 'updateVote'; contestId: ContestId; vote: OptionalVote }
  | { type: 'forceSaveVote' }
  | { type: 'resetBallot'; showPostVotingInstructions?: boolean }
  | { type: 'setUserSettings'; userSettings: PartialUserSettings }
  | { type: 'updateAppPrecinct'; appPrecinct: PrecinctSelection }
  | { type: 'enableLiveMode' }
  | { type: 'toggleLiveMode' }
  | { type: 'updatePollsState'; pollsState: PollsState }
  | { type: 'updateTally' }
  | { type: 'updateElectionDefinition'; electionDefinition: ElectionDefinition }
  | { type: 'initializeAppState'; appState: Partial<State> };

function appReducer(state: State, action: AppAction): State {
  const resetTally: Partial<State> = {
    ballotsPrintedCount: initialAppState.ballotsPrintedCount,
  };
  switch (action.type) {
    case 'updateLastVoteUpdateAt':
      return {
        ...state,
        lastVoteUpdateAt: action.date,
      };
    case 'unconfigure':
      return {
        ...state,
        ...initialUserState,
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
    case 'forceSaveVote':
      return {
        ...state,
        forceSaveVoteFlag: true,
      };
    case 'resetBallot':
      return {
        ...state,
        ...initialVoterState,
        showPostVotingInstructions: action.showPostVotingInstructions,
      };
    case 'setUserSettings':
      return {
        ...state,
        userSettings: {
          ...state.userSettings,
          ...action.userSettings,
        },
      };
    case 'updateAppPrecinct':
      return {
        ...state,
        ...resetTally,
        appPrecinct: action.appPrecinct,
      };
    case 'enableLiveMode':
      return {
        ...state,
        ...resetTally,
        isLiveMode: true,
        pollsState: initialAppState.pollsState,
      };
    case 'toggleLiveMode':
      return {
        ...state,
        ...resetTally,
        isLiveMode: !state.isLiveMode,
        pollsState: initialAppState.pollsState,
      };
    case 'updatePollsState':
      return {
        ...state,
        pollsState: action.pollsState,
      };
    case 'updateTally': {
      return {
        ...state,
        ballotsPrintedCount: state.ballotsPrintedCount + 1,
      };
    }
    case 'updateElectionDefinition': {
      const { precincts } = action.electionDefinition.election;
      let defaultPrecinct: Optional<PrecinctSelection>;
      if (precincts.length === 1) {
        defaultPrecinct = singlePrecinctSelectionFor(precincts[0].id);
      }
      return {
        ...state,
        ...initialUserState,
        electionDefinition: action.electionDefinition,
        appPrecinct: defaultPrecinct,
      };
    }
    case 'initializeAppState':
      return {
        ...state,
        ...action.appState,
        initializedFromStorage: true,
      };
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(action);
  }
}

export function AppRoot({
  hardware,
  screenReader,
  storage,
  reload,
  logger,
}: Props): JSX.Element | null {
  const PostVotingInstructionsTimeout = useRef(0);
  const [appState, dispatchAppState] = useReducer(appReducer, initialAppState);
  const {
    appPrecinct,
    ballotsPrintedCount,
    electionDefinition: optionalElectionDefinition,
    isLiveMode,
    pollsState,
    initializedFromStorage,
    showPostVotingInstructions,
    userSettings,
    votes,
  } = appState;
  const electionHash = optionalElectionDefinition?.electionHash;

  const history = useHistory();

  const machineConfigQuery = getMachineConfig.useQuery();

  const devices = useDevices({ hardware, logger });
  const {
    cardReader,
    printer: printerInfo,
    accessibleController,
    computer,
  } = devices;
  const usbDrive = useUsbDrive({ logger });
  const hasPrinterAttached = printerInfo !== undefined;
  const previousHasPrinterAttached = usePrevious(hasPrinterAttached);

  const authStatusQuery = getAuthStatus.useQuery(electionHash);
  const authStatus = authStatusQuery.isSuccess
    ? authStatusQuery.data
    : InsertedSmartCardAuth.DEFAULT_AUTH_STATUS;

  const checkPinMutation = checkPin.useMutation(electionHash);
  const startCardlessVoterSessionMutation =
    startCardlessVoterSession.useMutation(electionHash);
  const endCardlessVoterSessionMutation =
    endCardlessVoterSession.useMutation(electionHash);
  const unconfigureMachineMutation = unconfigureMachine.useMutation();

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

  /** @deprecated Use backend state instead: configureBallotPackageFromUsb.useMutation() and getElectionDefinition.useQuery() */
  const updateElectionDefinition = useCallback(
    (electionDefinition: ElectionDefinition) => {
      dispatchAppState({
        type: 'updateElectionDefinition',
        electionDefinition,
      });
    },
    []
  );

  // Any time election definition is changed in the backend, update the frontend store too.
  const getElectionDefinitionQuery = getElectionDefinition.useQuery();
  useQueryChangeListener(
    getElectionDefinitionQuery,
    (newElectionDefinition) => {
      if (newElectionDefinition) {
        updateElectionDefinition(newElectionDefinition);
      }
    }
  );

  // Handle Storing Election Locally
  useEffect(() => {
    async function storeElection(electionDefinition: ElectionDefinition) {
      await storage.set(electionStorageKey, electionDefinition);
    }
    if (optionalElectionDefinition) {
      void storeElection(optionalElectionDefinition);
    }
  }, [optionalElectionDefinition, storage]);

  // Handle Vote Updated
  useEffect(() => {
    if (votes) {
      dispatchAppState({ type: 'updateLastVoteUpdateAt', date: Date.now() });
    }
  }, [votes]);

  const resetBallot = useCallback(
    (newShowPostVotingInstructions?: boolean) => {
      dispatchAppState({
        type: 'resetBallot',
        showPostVotingInstructions: newShowPostVotingInstructions,
      });
      history.push('/');
    },
    [history]
  );

  const hidePostVotingInstructions = useCallback(() => {
    clearTimeout(PostVotingInstructionsTimeout.current);
    endCardlessVoterSessionMutation.mutate(undefined, {
      onSuccess() {
        dispatchAppState({ type: 'resetBallot' });
      },
    });
  }, [endCardlessVoterSessionMutation]);

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
    await storage.clear();
    await unconfigureMachineMutation.mutateAsync();
    dispatchAppState({ type: 'unconfigure' });
    history.push('/');
  }, [storage, history, unconfigureMachineMutation]);

  const updateVote = useCallback((contestId: ContestId, vote: OptionalVote) => {
    dispatchAppState({ type: 'updateVote', contestId, vote });
  }, []);

  const forceSaveVote = useCallback(() => {
    dispatchAppState({ type: 'forceSaveVote' });
  }, []);

  const setUserSettings = useCallback(
    (newUserSettings: PartialUserSettings) => {
      dispatchAppState({
        type: 'setUserSettings',
        userSettings: newUserSettings,
      });
    },
    []
  );

  function useEffectToggleLargeDisplay() {
    document.documentElement.style.fontSize = `${
      GLOBALS.FONT_SIZES[GLOBALS.LARGE_DISPLAY_FONT_SIZE]
    }px`;
    return () => {
      document.documentElement.style.fontSize = `${
        GLOBALS.FONT_SIZES[GLOBALS.DEFAULT_FONT_SIZE]
      }px`;
    };
  }

  const updateAppPrecinct = useCallback((newAppPrecinct: PrecinctSelection) => {
    dispatchAppState({
      type: 'updateAppPrecinct',
      appPrecinct: newAppPrecinct,
    });
  }, []);

  const enableLiveMode = useCallback(() => {
    dispatchAppState({ type: 'enableLiveMode' });
  }, []);

  const toggleLiveMode = useCallback(() => {
    dispatchAppState({ type: 'toggleLiveMode' });
  }, []);

  const updatePollsState = useCallback(
    async (newPollsState: PollsState) => {
      assert(newPollsState !== 'polls_closed_initial');
      const logEvent = (() => {
        switch (newPollsState) {
          case 'polls_closed_final':
            return LogEventId.PollsClosed;
          case 'polls_paused':
            return LogEventId.VotingPaused;
          case 'polls_open':
            if (pollsState === 'polls_closed_initial') {
              return LogEventId.PollsOpened;
            }
            return LogEventId.VotingResumed;
          /* istanbul ignore next */
          default:
            throwIllegalValue(newPollsState);
        }
      })();

      dispatchAppState({
        type: 'updatePollsState',
        pollsState: newPollsState,
      });

      await logger.log(logEvent, 'poll_worker', { disposition: 'success' });
    },
    [logger, pollsState]
  );

  const resetPollsToPaused = useCallback(() => {
    dispatchAppState({ type: 'updatePollsState', pollsState: 'polls_paused' });
  }, []);

  const updateTally = useCallback(() => {
    dispatchAppState({ type: 'updateTally' });
  }, []);

  const activateCardlessBallot = useCallback(
    (sessionPrecinctId: PrecinctId, sessionBallotStyleId: BallotStyleId) => {
      assert(isPollWorkerAuth(authStatus));
      startCardlessVoterSessionMutation.mutate(
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
    [authStatus, resetBallot, startCardlessVoterSessionMutation]
  );

  const resetCardlessBallot = useCallback(() => {
    assert(isPollWorkerAuth(authStatus));
    endCardlessVoterSessionMutation.mutate(undefined, {
      onSuccess() {
        history.push('/');
      },
    });
  }, [authStatus, endCardlessVoterSessionMutation, history]);

  useEffect(() => {
    function resetBallotOnLogout() {
      if (!initializedFromStorage) return;
      if (
        authStatus.status === 'logged_out' &&
        authStatus.reason === 'no_card'
      ) {
        resetBallot();
      }
    }
    resetBallotOnLogout();
  }, [authStatus, resetBallot, initializedFromStorage]);

  const endVoterSession = useCallback(async () => {
    try {
      await endCardlessVoterSessionMutation.mutateAsync();
    } catch {
      // Handled by default query client error handling
    }
  }, [endCardlessVoterSessionMutation]);

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

  // Bootstraps the AppRoot Component
  useEffect(() => {
    async function updateStorage() {
      // TODO: validate this with zod schema
      const storedElectionDefinition = (await storage.get(
        electionStorageKey
      )) as ElectionDefinition | undefined;

      const storedAppState: Partial<State> =
        // TODO: validate this with zod schema
        ((await storage.get(stateStorageKey)) as Partial<State> | undefined) ||
        {};

      const {
        appPrecinct: storedAppPrecinct = initialAppState.appPrecinct,
        ballotsPrintedCount:
          storedBallotsPrintedCount = initialAppState.ballotsPrintedCount,
        isLiveMode: storedIsLiveMode = initialAppState.isLiveMode,
        pollsState: storedPollsState = initialAppState.pollsState,
      } = storedAppState;
      dispatchAppState({
        type: 'initializeAppState',
        appState: {
          appPrecinct: storedAppPrecinct,
          ballotsPrintedCount: storedBallotsPrintedCount,
          electionDefinition: storedElectionDefinition,
          isLiveMode: storedIsLiveMode,
          pollsState: storedPollsState,
        },
      });
    }
    void updateStorage();
  }, [storage]);

  // Handle Storing AppState (should be after last to ensure that storage is updated after all other updates)
  useEffect(() => {
    async function storeAppState() {
      if (initializedFromStorage) {
        await storage.set(stateStorageKey, {
          appPrecinct,
          ballotsPrintedCount,
          isLiveMode,
          pollsState,
        });
      }
    }

    void storeAppState();
  }, [
    appPrecinct,
    ballotsPrintedCount,
    isLiveMode,
    pollsState,
    storage,
    initializedFromStorage,
  ]);

  if (!machineConfigQuery.isSuccess || !authStatusQuery.isSuccess) {
    return null;
  }
  const machineConfig = machineConfigQuery.data;

  if (!cardReader) {
    return (
      <SetupCardReaderPage
        useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
      />
    );
  }
  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'card_error'
  ) {
    return (
      <CardErrorScreen
        useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
      />
    );
  }
  if (computer.batteryIsLow && !computer.batteryIsCharging) {
    return (
      <SetupPowerPage
        useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
      />
    );
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
      <React.Fragment>
        <SystemAdministratorScreen
          logger={logger}
          unconfigureMachine={unconfigure}
          isMachineConfigured={Boolean(optionalElectionDefinition)}
          resetPollsToPaused={
            pollsState === 'polls_closed_final'
              ? makeAsync(resetPollsToPaused)
              : undefined
          }
          usbDriveStatus={usbDrive.status}
        />
        {/* TODO: Replace all instances of SessionTimeLimitTracker in this file with a single
          instance in app.tsx once the election definition has been moved to the backend and this
          component no longer requires the election hash */}
        <SessionTimeLimitTracker electionHash={electionHash} />
      </React.Fragment>
    );
  }
  if (isElectionManagerAuth(authStatus)) {
    if (!optionalElectionDefinition) {
      return (
        <React.Fragment>
          <UnconfiguredElectionScreenWrapper
            usbDriveStatus={usbDrive.status}
            updateElectionDefinition={updateElectionDefinition}
          />
          <SessionTimeLimitTracker electionHash={electionHash} />
        </React.Fragment>
      );
    }

    // We prevent mismatch in {ballot package, auth} election hash at configuration time,
    // but mismatch may still occur if the user removes the matching card and inserts another
    // card with a mismatched election hash
    if (
      authStatus.user.electionHash !== optionalElectionDefinition.electionHash
    ) {
      return (
        <React.Fragment>
          <ReplaceElectionScreen
            appPrecinct={appPrecinct}
            ballotsPrintedCount={ballotsPrintedCount}
            authElectionHash={authStatus.user.electionHash}
            electionDefinition={optionalElectionDefinition}
            machineConfig={machineConfig}
            screenReader={screenReader}
            unconfigure={unconfigure}
            isLoading={unconfigureMachineMutation.isLoading}
            isError={unconfigureMachineMutation.isError}
          />
          <SessionTimeLimitTracker electionHash={electionHash} />
        </React.Fragment>
      );
    }

    return (
      <React.Fragment>
        <AdminScreen
          appPrecinct={appPrecinct}
          ballotsPrintedCount={ballotsPrintedCount}
          electionDefinition={optionalElectionDefinition}
          isLiveMode={isLiveMode}
          updateAppPrecinct={updateAppPrecinct}
          toggleLiveMode={toggleLiveMode}
          unconfigure={unconfigure}
          machineConfig={machineConfig}
          screenReader={screenReader}
          pollsState={pollsState}
          logger={logger}
          usbDrive={usbDrive}
        />
        <SessionTimeLimitTracker electionHash={electionHash} />
      </React.Fragment>
    );
  }
  if (optionalElectionDefinition && appPrecinct) {
    if (!hasPrinterAttached) {
      return (
        <SetupPrinterPage
          useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
        />
      );
    }
    if (
      authStatus.status === 'logged_out' &&
      authStatus.reason === 'poll_worker_wrong_election'
    ) {
      return (
        <WrongElectionScreen
          useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
        />
      );
    }
    if (isPollWorkerAuth(authStatus)) {
      return (
        <React.Fragment>
          <PollWorkerScreen
            pollWorkerAuth={authStatus}
            activateCardlessVoterSession={activateCardlessBallot}
            resetCardlessVoterSession={resetCardlessBallot}
            appPrecinct={appPrecinct}
            electionDefinition={optionalElectionDefinition}
            enableLiveMode={enableLiveMode}
            isLiveMode={isLiveMode}
            pollsState={pollsState}
            ballotsPrintedCount={ballotsPrintedCount}
            machineConfig={machineConfig}
            hardware={hardware}
            devices={devices}
            screenReader={screenReader}
            updatePollsState={updatePollsState}
            hasVotes={!!votes}
            reload={reload}
            logger={logger}
          />
          <SessionTimeLimitTracker electionHash={electionHash} />
        </React.Fragment>
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
                isLiveMode,
                endVoterSession,
                resetBallot,
                setUserSettings,
                updateVote,
                forceSaveVote,
                userSettings,
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
          isLiveMode={isLiveMode}
          pollsState={pollsState}
        />
      </IdleTimerProvider>
    );
  }
  return (
    <UnconfiguredScreen
      hasElectionDefinition={Boolean(optionalElectionDefinition)}
    />
  );
}
