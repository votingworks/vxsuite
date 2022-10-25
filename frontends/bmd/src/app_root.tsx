import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  BallotType,
  Card,
  CompletedBallot,
  ElectionDefinition,
  OptionalElectionDefinition,
  OptionalVote,
  Provider,
  VotesDict,
  getBallotStyle,
  getContests,
  safeParseElectionDefinition,
  Optional,
  ContestId,
  PrecinctId,
  BallotStyleId,
  PrecinctSelection,
} from '@votingworks/types';
import { decodeBallot, encodeBallot } from '@votingworks/ballot-encoder';
import 'normalize.css';

import Gamepad from 'react-gamepad';
import { useHistory } from 'react-router-dom';
import './App.css';
import IdleTimer from 'react-idle-timer';
import useInterval from '@rooks/use-interval';
import {
  assert,
  Storage,
  Hardware,
  throwIllegalValue,
  usbstick,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';

import { Logger } from '@votingworks/logging';

import {
  isElectionManagerAuth,
  isCardlessVoterAuth,
  isPollWorkerAuth,
  isSystemAdministratorAuth,
  isVoterAuth,
  SetupCardReaderPage,
  useDevices,
  usePrevious,
  useInsertedSmartcardAuth,
  useUsbDrive,
  CARD_POLLING_INTERVAL,
  UnlockMachineScreen,
} from '@votingworks/ui';
import { Ballot } from './components/ballot';
import * as GLOBALS from './config/globals';
import {
  MarkVoterCardFunction,
  PartialUserSettings,
  UserSettings,
  MarkOnly,
  MachineConfig,
  PostVotingInstructions,
} from './config/types';
import { BallotContext } from './contexts/ballot_context';
import {
  handleGamepadButtonDown,
  handleGamepadKeyboardEvent,
} from './lib/gamepad';
import { CastBallotPage } from './pages/cast_ballot_page';
import { AdminScreen } from './pages/admin_screen';
import { ExpiredCardScreen } from './pages/expired_card_screen';
import { InsertCardScreen } from './pages/insert_card_screen';
import { PollWorkerScreen } from './pages/poll_worker_screen';
import { PrintOnlyScreen } from './pages/print_only_screen';
import { SetupPrinterPage } from './pages/setup_printer_page';
import { SetupPowerPage } from './pages/setup_power_page';
import { UnconfiguredScreen } from './pages/unconfigured_screen';
import { UsedCardScreen } from './pages/used_card_screen';
import { WrongElectionScreen } from './pages/wrong_election_screen';
import { WrongPrecinctScreen } from './pages/wrong_precinct_screen';
import { ScreenReader } from './utils/ScreenReader';
import { ReplaceElectionScreen } from './pages/replace_election_screen';
import { CardErrorScreen } from './pages/card_error_screen';
import { SystemAdministratorScreen } from './pages/system_administrator_screen';

interface UserState {
  userSettings: UserSettings;
  votes?: VotesDict;
  showPostVotingInstructions?: PostVotingInstructions;
}

interface HardwareState {
  machineConfig: Readonly<MachineConfig>;
}

interface SharedState {
  appPrecinct?: PrecinctSelection;
  ballotsPrintedCount: number;
  electionDefinition: OptionalElectionDefinition;
  isLiveMode: boolean;
  isPollsOpen: boolean;
}

interface OtherState {
  lastVoteUpdateAt: number;
  lastVoteSaveToCardAt: number;
  forceSaveVoteFlag: boolean;
  writingVoteToCard: boolean;
  initializedFromStorage: boolean;
}

export interface InitialUserState extends UserState, SharedState {}

export interface State extends InitialUserState, HardwareState, OtherState {}

export interface AppStorage {
  electionDefinition?: ElectionDefinition;
  state?: Partial<State>;
}
export interface Props {
  card: Card;
  hardware: Hardware;
  machineConfig: Provider<MachineConfig>;
  storage: Storage;
  screenReader: ScreenReader;
  reload: VoidFunction;
  logger: Logger;
}

export const electionStorageKey = 'electionDefinition';
export const stateStorageKey = 'state';
export const blankBallotVotes: VotesDict = {};

const initialVoterState: Readonly<UserState> = {
  userSettings: { textSize: GLOBALS.TEXT_SIZE },
  votes: undefined,
  showPostVotingInstructions: undefined,
};

const initialHardwareState: Readonly<HardwareState> = {
  machineConfig: { appMode: MarkOnly, machineId: '0000', codeVersion: 'dev' },
};

const initialSharedState: Readonly<SharedState> = {
  appPrecinct: undefined,
  ballotsPrintedCount: 0,
  electionDefinition: undefined,
  isLiveMode: false,
  isPollsOpen: false,
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
  ...initialHardwareState,
  ...initialOtherState,
};

// Sets State. All side effects done outside: storage, fetching, etc
type AppAction =
  | { type: 'setMachineConfig'; machineConfig: MachineConfig }
  | { type: 'updateLastVoteUpdateAt'; date: number }
  | { type: 'unconfigure' }
  | { type: 'updateVote'; contestId: ContestId; vote: OptionalVote }
  | { type: 'forceSaveVote' }
  | { type: 'loadVotesFromVoterCard'; votes: VotesDict }
  | { type: 'resetBallot'; showPostVotingInstructions?: PostVotingInstructions }
  | { type: 'setUserSettings'; userSettings: PartialUserSettings }
  | { type: 'updateAppPrecinct'; appPrecinct: PrecinctSelection }
  | { type: 'enableLiveMode' }
  | { type: 'toggleLiveMode' }
  | { type: 'togglePollsOpen' }
  | { type: 'updateTally' }
  | { type: 'updateElectionDefinition'; electionDefinition: ElectionDefinition }
  | { type: 'startWritingLongValue' }
  | { type: 'finishWritingLongValue' }
  | { type: 'initializeAppState'; appState: Partial<State> };

function appReducer(state: State, action: AppAction): State {
  const resetTally: Partial<State> = {
    ballotsPrintedCount: initialAppState.ballotsPrintedCount,
  };
  switch (action.type) {
    case 'setMachineConfig':
      return {
        ...state,
        machineConfig:
          action.machineConfig ?? initialHardwareState.machineConfig,
      };
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
    case 'loadVotesFromVoterCard':
      return {
        ...state,
        votes: action.votes,
      };
    case 'resetBallot':
      return {
        ...state,
        ...initialVoterState,
        showPostVotingInstructions: action.showPostVotingInstructions,
      };
    case 'setUserSettings':
      /* istanbul ignore next */
      if (Object.keys(action.userSettings).join(',') !== 'textSize') {
        throw new Error('unknown userSetting key');
      }
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
        isPollsOpen: initialAppState.isPollsOpen,
      };
    case 'toggleLiveMode':
      return {
        ...state,
        ...resetTally,
        isLiveMode: !state.isLiveMode,
        isPollsOpen: initialAppState.isPollsOpen,
      };
    case 'togglePollsOpen':
      return {
        ...state,
        isPollsOpen: !state.isPollsOpen,
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
    case 'startWritingLongValue':
      return {
        ...state,
        writingVoteToCard: true,
        forceSaveVoteFlag: false,
        lastVoteSaveToCardAt: Date.now(),
      };
    case 'finishWritingLongValue':
      return {
        ...state,
        writingVoteToCard: false,
      };
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
  card,
  hardware,
  machineConfig: machineConfigProvider,
  screenReader,
  storage,
  reload,
  logger,
}: Props): JSX.Element {
  const PostVotingInstructionsTimeout = useRef(0);
  const [appState, dispatchAppState] = useReducer(appReducer, initialAppState);
  const {
    appPrecinct,
    ballotsPrintedCount,
    electionDefinition: optionalElectionDefinition,
    isLiveMode,
    isPollsOpen,
    initializedFromStorage,
    machineConfig,
    showPostVotingInstructions,
    userSettings,
    votes,
  } = appState;

  const history = useHistory();
  const { appMode } = machineConfig;

  const devices = useDevices({ hardware, logger });
  const {
    cardReader,
    printer: printerInfo,
    accessibleController,
    computer,
  } = devices;
  const usbDrive = useUsbDrive({ logger });
  const displayUsbStatus = usbDrive.status ?? usbstick.UsbDriveStatus.absent;
  const hasPrinterAttached = printerInfo !== undefined;
  const previousHasPrinterAttached = usePrevious(hasPrinterAttached);

  const auth = useInsertedSmartcardAuth({
    allowedUserRoles: [
      'system_administrator',
      'election_manager',
      'poll_worker',
      'voter',
      'cardless_voter',
    ],
    cardApi: card,
    scope: {
      // The BMD allows election managers to update the machine to use the election definition on
      // the card in this case
      allowElectionManagersToAccessMachinesConfiguredForOtherElections: true,
      electionDefinition: optionalElectionDefinition,
      precinct: appPrecinct,
    },
    logger,
  });

  const precinctId =
    isVoterAuth(auth) || isCardlessVoterAuth(auth)
      ? auth.user.precinctId
      : undefined;
  const ballotStyleId =
    isVoterAuth(auth) || isCardlessVoterAuth(auth)
      ? auth.user.ballotStyleId
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
      ? getContests({
          election: optionalElectionDefinition.election,
          ballotStyle,
        })
      : [];

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
    (newShowPostVotingInstructions?: PostVotingInstructions) => {
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
    if (isCardlessVoterAuth(auth)) auth.logOut();
    dispatchAppState({ type: 'resetBallot' });
  }, [auth]);

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
    /* We don't include hidePostVotingInstructions because it is updatedi
     * frequently due to its dependency on auth, which causes this effect to
     * run/cleanup,clearing the timeout.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPostVotingInstructions]);

  const unconfigure = useCallback(async () => {
    await storage.clear();
    dispatchAppState({ type: 'unconfigure' });
    history.push('/');
  }, [storage, history]);

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

  const togglePollsOpen = useCallback(() => {
    dispatchAppState({ type: 'togglePollsOpen' });
  }, []);

  const updateTally = useCallback(() => {
    dispatchAppState({ type: 'updateTally' });
  }, []);

  const getElectionDefinitionFromCard = useCallback(async (): Promise<
    Optional<ElectionDefinition>
  > => {
    assert(isElectionManagerAuth(auth));
    const electionData = (await auth.card.readStoredString()).ok();
    /* istanbul ignore else */
    if (electionData) {
      const electionDefinitionResult =
        safeParseElectionDefinition(electionData);
      return electionDefinitionResult.unsafeUnwrap();
    }
  }, [auth]);

  const updateElectionDefinition = useCallback(
    (electionDefinition: ElectionDefinition) => {
      dispatchAppState({
        type: 'updateElectionDefinition',
        electionDefinition,
      });
    },
    []
  );

  const fetchElection = useCallback(async () => {
    const newElectionDefinition = await getElectionDefinitionFromCard();
    /* istanbul ignore else */
    if (newElectionDefinition) {
      updateElectionDefinition(newElectionDefinition);
    }
  }, [getElectionDefinitionFromCard, updateElectionDefinition]);

  const activateCardlessBallot = useCallback(
    (sessionPrecinctId: PrecinctId, sessionBallotStyleId: BallotStyleId) => {
      assert(isPollWorkerAuth(auth));
      auth.activateCardlessVoter(sessionPrecinctId, sessionBallotStyleId);
      resetBallot();
    },
    [auth, resetBallot]
  );

  const resetCardlessBallot = useCallback(() => {
    assert(isPollWorkerAuth(auth));
    auth.deactivateCardlessVoter();
    history.push('/');
  }, [history, auth]);

  useEffect(() => {
    async function loadVotesFromVoterCard() {
      if (isVoterAuth(auth) && auth.card.hasStoredData && !votes) {
        const ballotData = (await auth.card.readStoredUint8Array()).ok();
        assert(optionalElectionDefinition && ballotData);
        const ballot = decodeBallot(
          optionalElectionDefinition.election,
          ballotData
        );
        dispatchAppState({
          type: 'loadVotesFromVoterCard',
          votes: ballot.votes,
        });
      }
    }
    void loadVotesFromVoterCard();
  }, [auth, optionalElectionDefinition, votes]);

  useEffect(() => {
    function resetBallotOnLogout() {
      if (!initializedFromStorage) return;
      if (auth.status === 'logged_out' && auth.reason === 'no_card') {
        resetBallot();
      }
    }
    resetBallotOnLogout();
  }, [auth, resetBallot, initializedFromStorage]);

  useInterval(
    async () => {
      if (
        isVoterAuth(auth) &&
        ((appState.lastVoteSaveToCardAt < appState.lastVoteUpdateAt &&
          appState.lastVoteUpdateAt <
            Date.now() - GLOBALS.CARD_LONG_VALUE_WRITE_DELAY) ||
          appState.forceSaveVoteFlag) &&
        !appState.writingVoteToCard
      ) {
        dispatchAppState({ type: 'startWritingLongValue' });
        assert(appState.electionDefinition);
        const { election, electionHash } = appState.electionDefinition;
        const ballot: CompletedBallot = {
          electionHash,
          ballotStyleId: auth.user.ballotStyleId,
          precinctId: auth.user.precinctId,
          votes: appState.votes ?? blankBallotVotes,
          isTestMode: !appState.isLiveMode,
          ballotType: BallotType.Standard,
        };
        const longValue = encodeBallot(election, ballot);
        await auth.card.writeStoredData(longValue);
        dispatchAppState({ type: 'finishWritingLongValue' });
      }
    },
    CARD_POLLING_INTERVAL,
    true
  );

  const markVoterCardVoided: MarkVoterCardFunction = useCallback(async () => {
    if (isCardlessVoterAuth(auth)) {
      auth.logOut();
      return true;
    }
    assert(isVoterAuth(auth));
    await auth.card.clearStoredData();
    return (await auth.markCardVoided()).isOk();
  }, [auth]);

  const markVoterCardPrinted: MarkVoterCardFunction = useCallback(async () => {
    if (isCardlessVoterAuth(auth)) return true;
    assert(isVoterAuth(auth));
    await auth.card.clearStoredData();
    return (await auth.markCardPrinted()).isOk();
  }, [auth]);

  // Handle Hardware Observer Subscription
  useEffect(() => {
    function resetBallotOnPrinterDetach() {
      if (previousHasPrinterAttached && !hasPrinterAttached) {
        resetBallot();
      }
    }
    void resetBallotOnPrinterDetach();
  }, [previousHasPrinterAttached, hasPrinterAttached, resetBallot]);

  // Handle Machine Config
  useEffect(() => {
    async function setMachineConfig() {
      try {
        const newMachineConfig = await machineConfigProvider.get();
        dispatchAppState({
          type: 'setMachineConfig',
          machineConfig: newMachineConfig,
        });
      } catch {
        // Do nothing if machineConfig fails. Default values will be used.
      }
    }
    void setMachineConfig();
  }, [machineConfigProvider]);

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
        isPollsOpen: storedIsPollsOpen = initialAppState.isPollsOpen,
      } = storedAppState;
      dispatchAppState({
        type: 'initializeAppState',
        appState: {
          appPrecinct: storedAppPrecinct,
          ballotsPrintedCount: storedBallotsPrintedCount,
          electionDefinition: storedElectionDefinition,
          isLiveMode: storedIsLiveMode,
          isPollsOpen: storedIsPollsOpen,
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
          isPollsOpen,
        });
      }
    }

    void storeAppState();
  }, [
    appPrecinct,
    ballotsPrintedCount,
    isLiveMode,
    isPollsOpen,
    storage,
    initializedFromStorage,
  ]);

  if (!cardReader) {
    return (
      <SetupCardReaderPage
        useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
      />
    );
  }
  if (auth.status === 'logged_out' && auth.reason === 'card_error') {
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
  if (auth.status === 'checking_passcode') {
    return <UnlockMachineScreen auth={auth} />;
  }
  if (isSystemAdministratorAuth(auth)) {
    return (
      <SystemAdministratorScreen
        logger={logger}
        unconfigureMachine={unconfigure}
        isMachineConfigured={Boolean(optionalElectionDefinition)}
        usbDriveStatus={displayUsbStatus}
      />
    );
  }
  if (isElectionManagerAuth(auth)) {
    if (
      optionalElectionDefinition &&
      auth.user.electionHash !== optionalElectionDefinition.electionHash
    ) {
      return (
        <ReplaceElectionScreen
          appPrecinct={appPrecinct}
          ballotsPrintedCount={ballotsPrintedCount}
          electionDefinition={optionalElectionDefinition}
          getElectionDefinitionFromCard={getElectionDefinitionFromCard}
          machineConfig={machineConfig}
          screenReader={screenReader}
          unconfigure={unconfigure}
        />
      );
    }

    return (
      <AdminScreen
        appPrecinct={appPrecinct}
        ballotsPrintedCount={ballotsPrintedCount}
        electionDefinition={optionalElectionDefinition}
        fetchElection={fetchElection}
        isLiveMode={isLiveMode}
        updateAppPrecinct={updateAppPrecinct}
        toggleLiveMode={toggleLiveMode}
        unconfigure={unconfigure}
        machineConfig={machineConfig}
        screenReader={screenReader}
      />
    );
  }
  if (optionalElectionDefinition && appPrecinct) {
    if (appMode.isPrint && !hasPrinterAttached) {
      return (
        <SetupPrinterPage
          useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
        />
      );
    }
    if (
      auth.status === 'logged_out' &&
      (auth.reason === 'poll_worker_wrong_election' ||
        auth.reason === 'voter_wrong_election')
    ) {
      return (
        <WrongElectionScreen
          useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
          isVoterCard={auth.reason === 'voter_wrong_election'}
        />
      );
    }
    if (isPollWorkerAuth(auth)) {
      return (
        <PollWorkerScreen
          pollworkerAuth={auth}
          activateCardlessVoterSession={activateCardlessBallot}
          resetCardlessVoterSession={resetCardlessBallot}
          appPrecinct={appPrecinct}
          electionDefinition={optionalElectionDefinition}
          enableLiveMode={enableLiveMode}
          isLiveMode={isLiveMode}
          isPollsOpen={isPollsOpen}
          ballotsPrintedCount={ballotsPrintedCount}
          machineConfig={machineConfig}
          hardware={hardware}
          devices={devices}
          screenReader={screenReader}
          togglePollsOpen={togglePollsOpen}
          hasVotes={!!votes}
          reload={reload}
        />
      );
    }
    if (
      isPollsOpen &&
      auth.status === 'logged_out' &&
      (auth.reason === 'voter_card_expired' ||
        auth.reason === 'voter_card_voided')
    ) {
      return (
        <ExpiredCardScreen
          useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
        />
      );
    }
    if (
      isPollsOpen &&
      showPostVotingInstructions &&
      appMode.isMark &&
      appMode.isPrint
    ) {
      return (
        <CastBallotPage
          showPostVotingInstructions={showPostVotingInstructions}
          hidePostVotingInstructions={hidePostVotingInstructions}
        />
      );
    }
    if (
      isPollsOpen &&
      auth.status === 'logged_out' &&
      auth.reason === 'voter_card_printed'
    ) {
      return (
        <UsedCardScreen
          useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
        />
      );
    }
    if (isPollsOpen) {
      if (
        auth.status === 'logged_out' &&
        auth.reason === 'voter_wrong_precinct'
      ) {
        return (
          <WrongPrecinctScreen
            useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
          />
        );
      }

      if (appMode.isPrint && !appMode.isMark) {
        return (
          <PrintOnlyScreen
            ballotStyleId={ballotStyleId}
            ballotsPrintedCount={ballotsPrintedCount}
            electionDefinition={optionalElectionDefinition}
            isLiveMode={isLiveMode}
            isVoterCardPresent={isVoterAuth(auth)}
            markVoterCardPrinted={markVoterCardPrinted}
            precinctId={precinctId}
            useEffectToggleLargeDisplay={useEffectToggleLargeDisplay}
            showNoChargerAttachedWarning={!computer.batteryIsCharging}
            updateTally={updateTally}
            votes={votes}
          />
        );
      }

      if (isCardlessVoterAuth(auth) || isVoterAuth(auth)) {
        return (
          <Gamepad onButtonDown={handleGamepadButtonDown}>
            <BallotContext.Provider
              value={{
                machineConfig,
                precinctId,
                ballotStyleId,
                contests,
                electionDefinition: optionalElectionDefinition,
                updateTally,
                isCardlessVoter: isCardlessVoterAuth(auth),
                isLiveMode,
                markVoterCardPrinted,
                markVoterCardVoided,
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
      <IdleTimer
        onIdle={() => /* istanbul ignore next */ window.kiosk?.quit()}
        timeout={GLOBALS.QUIT_KIOSK_IDLE_SECONDS * 1000}
      >
        <InsertCardScreen
          appPrecinct={appPrecinct}
          electionDefinition={optionalElectionDefinition}
          showNoAccessibleControllerWarning={
            appMode.isMark && !accessibleController
          }
          showNoChargerAttachedWarning={!computer.batteryIsCharging}
          isLiveMode={isLiveMode}
          isPollsOpen={isPollsOpen}
          machineConfig={machineConfig}
        />
      </IdleTimer>
    );
  }
  return (
    <UnconfiguredScreen
      hasElectionDefinition={Boolean(optionalElectionDefinition)}
    />
  );
}
