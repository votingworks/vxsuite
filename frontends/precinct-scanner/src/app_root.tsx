import React, { useCallback, useEffect, useReducer } from 'react';
import 'normalize.css';
import makeDebug from 'debug';

import {
  OptionalElectionDefinition,
  Provider,
  PrecinctId,
  MarkThresholds,
  ElectionDefinition,
} from '@votingworks/types';
import {
  useCancelablePromise,
  useUsbDrive,
  SetupCardReaderPage,
  useDevices,
  UnlockMachineScreen,
  useInsertedSmartcardAuth,
  isSystemAdministratorAuth,
  isElectionManagerAuth,
  isPollWorkerAuth,
  SystemAdministratorScreenContents,
} from '@votingworks/ui';
import {
  throwIllegalValue,
  Card,
  Hardware,
  Storage,
  usbstick,
  Printer,
  assert,
} from '@votingworks/utils';
import { Logger } from '@votingworks/logging';

import { UnconfiguredElectionScreen } from './screens/unconfigured_election_screen';
import { LoadingConfigurationScreen } from './screens/loading_configuration_screen';
import { MachineConfig } from './config/types';

import * as config from './api/config';
import * as scanner from './api/scan';

import { usePrecinctScannerStatus } from './hooks/use_precinct_scanner_status';
import { ElectionManagerScreen } from './screens/election_manager_screen';
import { InvalidCardScreen } from './screens/invalid_card_screen';
import { PollsClosedScreen } from './screens/polls_closed_screen';
import { PollWorkerScreen } from './screens/poll_worker_screen';
import { InsertBallotScreen } from './screens/insert_ballot_screen';
import { ScanErrorScreen } from './screens/scan_error_screen';
import { ScanSuccessScreen } from './screens/scan_success_screen';
import { ScanWarningScreen } from './screens/scan_warning_screen';
import { ScanProcessingScreen } from './screens/scan_processing_screen';
import { AppContext } from './contexts/app_context';
import { CardErrorScreen } from './screens/card_error_screen';
import { SetupScannerScreen } from './screens/setup_scanner_screen';
import { ScreenMainCenterChild } from './components/layout';
import { InsertUsbScreen } from './screens/insert_usb_screen';
import { ScanReturnedBallotScreen } from './screens/scan_returned_ballot_screen';
import { ScanJamScreen } from './screens/scan_jam_screen';
import { ScanBusyScreen } from './screens/scan_busy_screen';
import { ReplaceBallotBagScreen } from './components/replace_ballot_bag_screen';
import { BALLOT_BAG_CAPACITY } from './config/globals';

const debug = makeDebug('precinct-scanner:app-root');

export interface AppStorage {
  state?: Partial<State>;
}

export const stateStorageKey = 'state';

export interface Props {
  hardware: Hardware;
  card: Card;
  storage: Storage;
  printer: Printer;
  machineConfig: Provider<MachineConfig>;
  logger: Logger;
}

interface HardwareState {
  machineConfig: Readonly<MachineConfig>;
}

interface ScannerConfigState {
  isScannerConfigLoaded: boolean;
  electionDefinition?: ElectionDefinition;
  currentPrecinctId?: PrecinctId;
  currentMarkThresholds?: MarkThresholds;
  isTestMode: boolean;
}

interface FrontendState {
  isPollsOpen: boolean;
  ballotCountWhenBallotBagLastReplaced: number;
  initializedFromStorage: boolean;
}

export interface State
  extends HardwareState,
    ScannerConfigState,
    FrontendState {}

const initialHardwareState: Readonly<HardwareState> = {
  machineConfig: {
    machineId: '0000',
    codeVersion: 'dev',
  },
};

const initialScannerConfigState: Readonly<ScannerConfigState> = {
  isScannerConfigLoaded: false,
  electionDefinition: undefined,
  isTestMode: false,
  currentMarkThresholds: undefined,
  currentPrecinctId: undefined,
};

const initialAppState: Readonly<FrontendState> = {
  isPollsOpen: false,
  ballotCountWhenBallotBagLastReplaced: 0,
  initializedFromStorage: false,
};

const initialState: Readonly<State> = {
  ...initialHardwareState,
  ...initialScannerConfigState,
  ...initialAppState,
};

// Sets State.
type AppAction =
  | {
      type: 'initializeAppState';
      isPollsOpen: boolean;
      ballotCountWhenBallotBagLastReplaced: number;
    }
  | { type: 'resetPollsToClosed' }
  | {
      type: 'updateElectionDefinition';
      electionDefinition: OptionalElectionDefinition;
    }
  | {
      type: 'refreshConfigFromScanner';
      electionDefinition?: ElectionDefinition;
      isTestMode: boolean;
      currentMarkThresholds?: MarkThresholds;
      currentPrecinctId?: PrecinctId;
    }
  | { type: 'updatePrecinctId'; precinctId?: PrecinctId }
  | { type: 'updateMarkThresholds'; markThresholds?: MarkThresholds }
  | { type: 'togglePollsOpen' }
  | { type: 'ballotBagReplaced'; currentBallotCount: number }
  | { type: 'setMachineConfig'; machineConfig: MachineConfig };

function appReducer(state: State, action: AppAction): State {
  debug(
    '%cReducer "%s"',
    'color: green',
    action.type,
    { ...action, electionDefinition: undefined },
    {
      ...state,
      electionDefinition: undefined,
    }
  );
  switch (action.type) {
    case 'initializeAppState':
      return {
        ...state,
        isPollsOpen: action.isPollsOpen,
        ballotCountWhenBallotBagLastReplaced:
          action.ballotCountWhenBallotBagLastReplaced,
        initializedFromStorage: true,
      };
    case 'updateElectionDefinition':
      return {
        ...state,
        electionDefinition: action.electionDefinition,
        isPollsOpen: false,
        ballotCountWhenBallotBagLastReplaced: 0,
      };
    case 'resetPollsToClosed':
      return {
        ...state,
        isPollsOpen: false,
        ballotCountWhenBallotBagLastReplaced: 0,
      };
    case 'refreshConfigFromScanner': {
      return {
        ...state,
        electionDefinition: action.electionDefinition,
        currentPrecinctId: action.currentPrecinctId,
        currentMarkThresholds: action.currentMarkThresholds,
        isTestMode: action.isTestMode,
        isScannerConfigLoaded: true,
      };
    }
    case 'updatePrecinctId':
      return {
        ...state,
        currentPrecinctId: action.precinctId,
        isPollsOpen: false,
      };
    case 'updateMarkThresholds':
      return {
        ...state,
        currentMarkThresholds: action.markThresholds,
      };
    case 'togglePollsOpen':
      return {
        ...state,
        isPollsOpen: !state.isPollsOpen,
      };
    case 'ballotBagReplaced':
      return {
        ...state,
        ballotCountWhenBallotBagLastReplaced: action.currentBallotCount,
      };
    case 'setMachineConfig':
      return {
        ...state,
        machineConfig:
          action.machineConfig ?? initialHardwareState.machineConfig,
      };
    default:
      throwIllegalValue(action);
  }
}

export function AppRoot({
  hardware,
  card,
  printer,
  storage,
  machineConfig: machineConfigProvider,
  logger,
}: Props): JSX.Element | null {
  const [appState, dispatchAppState] = useReducer(appReducer, initialState);
  const {
    electionDefinition,
    isScannerConfigLoaded,
    isTestMode,
    currentPrecinctId,
    currentMarkThresholds,
    isPollsOpen,
    initializedFromStorage,
    machineConfig,
  } = appState;

  const usbDrive = useUsbDrive({ logger });
  const usbDriveDisplayStatus =
    usbDrive.status ?? usbstick.UsbDriveStatus.absent;

  const {
    cardReader,
    computer,
    printer: printerInfo,
  } = useDevices({
    hardware,
    logger,
  });
  const auth = useInsertedSmartcardAuth({
    allowedUserRoles: [
      'system_administrator',
      'election_manager',
      'poll_worker',
    ],
    cardApi: card,
    scope: { electionDefinition },
    logger,
  });

  const makeCancelable = useCancelablePromise();

  const refreshConfig = useCallback(async () => {
    const newElectionDefinition = await makeCancelable(
      config.getElectionDefinition()
    );
    const newIsTestMode = await makeCancelable(config.getTestMode());
    const newCurrentPrecinctId = await makeCancelable(
      config.getCurrentPrecinctId()
    );
    const newMarkThresholds = await makeCancelable(config.getMarkThresholds());
    dispatchAppState({
      type: 'refreshConfigFromScanner',
      electionDefinition: newElectionDefinition,
      isTestMode: newIsTestMode,
      currentMarkThresholds: newMarkThresholds,
      currentPrecinctId: newCurrentPrecinctId,
    });
  }, [makeCancelable]);

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

  // Initialize app state
  useEffect(() => {
    async function initializeScanner() {
      try {
        await refreshConfig();
      } catch (e) {
        debug('failed to initialize:', e);
        window.setTimeout(initializeScanner, 1000);
      }
    }

    async function updateStateFromStorage() {
      const storedAppState: Partial<State> =
        ((await storage.get(stateStorageKey)) as Partial<State> | undefined) ||
        {};
      const {
        isPollsOpen: storedIsPollsOpen = initialAppState.isPollsOpen,
        ballotCountWhenBallotBagLastReplaced:
          storedBallotCountWhenBallotBagLastReplaced = initialAppState.ballotCountWhenBallotBagLastReplaced,
      } = storedAppState;
      dispatchAppState({
        type: 'initializeAppState',
        isPollsOpen: storedIsPollsOpen,
        ballotCountWhenBallotBagLastReplaced:
          storedBallotCountWhenBallotBagLastReplaced,
      });
    }

    void initializeScanner();
    void updateStateFromStorage();
  }, [refreshConfig, storage]);

  useEffect(() => {
    async function storeAppState() {
      // only store app state if we've first initialized from the stored state
      if (initializedFromStorage) {
        await storage.set(stateStorageKey, {
          isPollsOpen,
        });
      }
    }

    void storeAppState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPollsOpen, initializedFromStorage]);

  const togglePollsOpen = useCallback(() => {
    dispatchAppState({ type: 'togglePollsOpen' });
  }, []);

  const toggleTestMode = useCallback(async () => {
    await config.setTestMode(!isTestMode);
    dispatchAppState({ type: 'resetPollsToClosed' });
    await refreshConfig();
  }, [refreshConfig, isTestMode]);

  const unconfigureServer = useCallback(
    async (options: { ignoreBackupRequirement?: boolean } = {}) => {
      try {
        await config.setElection(undefined, options);
        dispatchAppState({ type: 'resetPollsToClosed' });
        await refreshConfig();
      } catch (error) {
        debug('failed unconfigureServer()', error);
      }
    },
    [refreshConfig]
  );

  async function updatePrecinctId(precinctId: PrecinctId) {
    dispatchAppState({ type: 'updatePrecinctId', precinctId });
    await config.setCurrentPrecinctId(precinctId);
  }

  async function updateMarkThresholds(markThresholds?: MarkThresholds) {
    dispatchAppState({ type: 'updateMarkThresholds', markThresholds });
    await config.setMarkThresholdOverrides(markThresholds);
  }

  const scannerStatus = usePrecinctScannerStatus();

  const needsToReplaceBallotBag =
    scannerStatus &&
    scannerStatus.ballotsCounted >=
      appState.ballotCountWhenBallotBagLastReplaced + BALLOT_BAG_CAPACITY;

  // The scan service waits to receive a command to scan or accept a ballot. The
  // frontend controls when this happens so that ensure we're only scanning when
  // we're in voter mode.
  const voterMode = auth.status === 'logged_out' && auth.reason === 'no_card';
  useEffect(() => {
    async function automaticallyScanAndAcceptBallots() {
      if (!(isPollsOpen && voterMode && !needsToReplaceBallotBag)) return;
      if (scannerStatus?.state === 'ready_to_scan') {
        await scanner.scanBallot();
      } else if (scannerStatus?.state === 'ready_to_accept') {
        await scanner.acceptBallot();
      }
    }
    void automaticallyScanAndAcceptBallots();
  });

  if (!cardReader) {
    return <SetupCardReaderPage />;
  }

  if (auth.status === 'logged_out' && auth.reason === 'card_error') {
    return <CardErrorScreen />;
  }

  if (
    auth.status === 'checking_passcode' &&
    auth.user.role === 'system_administrator'
  ) {
    return <UnlockMachineScreen auth={auth} />;
  }

  if (isSystemAdministratorAuth(auth)) {
    return (
      <ScreenMainCenterChild infoBar>
        <SystemAdministratorScreenContents
          displayRemoveCardToLeavePrompt
          logger={logger}
          primaryText={
            <React.Fragment>
              To adjust settings for the current election,
              <br />
              please insert an Election Manager or Poll Worker card.
            </React.Fragment>
          }
          unconfigureMachine={() =>
            unconfigureServer({ ignoreBackupRequirement: true })
          }
          usbDriveStatus={usbDriveDisplayStatus}
        />
      </ScreenMainCenterChild>
    );
  }

  if (scannerStatus?.state === 'disconnected') {
    return (
      <SetupScannerScreen
        batteryIsCharging={computer.batteryIsCharging}
        scannedBallotCount={scannerStatus?.ballotsCounted}
      />
    );
  }

  if (!isScannerConfigLoaded) {
    return <LoadingConfigurationScreen />;
  }

  if (!electionDefinition) {
    return (
      <UnconfiguredElectionScreen
        usbDriveStatus={usbDriveDisplayStatus}
        refreshConfig={refreshConfig}
      />
    );
  }

  if (auth.status === 'checking_passcode') {
    return <UnlockMachineScreen auth={auth} />;
  }

  // Wait until we load scanner status for the first time
  if (!scannerStatus) return null;

  if (isElectionManagerAuth(auth)) {
    return (
      <AppContext.Provider
        value={{
          electionDefinition,
          currentPrecinctId,
          currentMarkThresholds,
          machineConfig,
          auth,
        }}
      >
        <ElectionManagerScreen
          updateAppPrecinctId={updatePrecinctId}
          scannerStatus={scannerStatus}
          isTestMode={isTestMode}
          toggleLiveMode={toggleTestMode}
          setMarkThresholdOverrides={updateMarkThresholds}
          unconfigure={unconfigureServer}
          usbDrive={usbDrive}
        />
      </AppContext.Provider>
    );
  }

  if (window.kiosk && usbDrive.status !== usbstick.UsbDriveStatus.mounted) {
    return <InsertUsbScreen />;
  }

  if (needsToReplaceBallotBag && scannerStatus.state !== 'accepted') {
    return (
      <ReplaceBallotBagScreen
        scannedBallotCount={scannerStatus.ballotsCounted}
        pollWorkerAuthenticated={isPollWorkerAuth(auth)}
        onComplete={() =>
          dispatchAppState({
            type: 'ballotBagReplaced',
            currentBallotCount: scannerStatus.ballotsCounted,
          })
        }
      />
    );
  }

  if (isPollWorkerAuth(auth)) {
    return (
      <AppContext.Provider
        value={{
          electionDefinition,
          currentPrecinctId,
          currentMarkThresholds,
          machineConfig,
          auth,
        }}
      >
        <PollWorkerScreen
          scannedBallotCount={scannerStatus.ballotsCounted}
          isPollsOpen={isPollsOpen}
          togglePollsOpen={togglePollsOpen}
          printer={printer}
          hasPrinterAttached={!!printerInfo}
          isLiveMode={!isTestMode}
          usbDrive={usbDrive}
        />
      </AppContext.Provider>
    );
  }

  if (auth.status === 'logged_out' && auth.reason !== 'no_card') {
    return <InvalidCardScreen />;
  }

  // When no card is inserted, we're in "voter" mode
  assert(auth.status === 'logged_out' && auth.reason === 'no_card');

  if (!isPollsOpen) {
    return (
      <PollsClosedScreen
        isLiveMode={!isTestMode}
        showNoChargerWarning={!computer.batteryIsCharging}
        scannedBallotCount={scannerStatus.ballotsCounted}
      />
    );
  }

  const voterScreen = (() => {
    switch (scannerStatus.state) {
      case 'connecting':
        return null;
      case 'no_paper':
        return (
          <InsertBallotScreen
            isLiveMode={!isTestMode}
            scannedBallotCount={scannerStatus.ballotsCounted}
            showNoChargerWarning={!computer.batteryIsCharging}
          />
        );
      case 'ready_to_scan':
      case 'scanning':
      case 'ready_to_accept':
      case 'accepting':
        return <ScanProcessingScreen />;
      case 'accepted':
        return (
          <ScanSuccessScreen
            scannedBallotCount={scannerStatus.ballotsCounted}
          />
        );
      case 'needs_review':
      case 'accepting_after_review':
        assert(scannerStatus.interpretation?.type === 'NeedsReviewSheet');
        return (
          <ScanWarningScreen
            adjudicationReasonInfo={scannerStatus.interpretation.reasons}
          />
        );
      case 'returning':
      case 'returned':
        return <ScanReturnedBallotScreen />;
      case 'rejecting':
      case 'rejected':
        return (
          <ScanErrorScreen
            error={
              scannerStatus.interpretation?.type === 'InvalidSheet'
                ? scannerStatus.interpretation.reason
                : scannerStatus.error
            }
            isTestMode={isTestMode}
            scannedBallotCount={scannerStatus.ballotsCounted}
          />
        );
      case 'jammed':
        return (
          <ScanJamScreen scannedBallotCount={scannerStatus.ballotsCounted} />
        );
      case 'both_sides_have_paper':
        return <ScanBusyScreen />;
      case 'recovering_from_error':
        return <ScanProcessingScreen />;
      case 'unrecoverable_error':
        return (
          <ScanErrorScreen
            error={scannerStatus.error}
            isTestMode={isTestMode}
            scannedBallotCount={scannerStatus.ballotsCounted}
            restartRequired
          />
        );
      // If an election manager removes their card during calibration, we'll
      // hit this case. Just show a blank screen for now, since this shouldn't
      // really happen.
      case 'calibrating':
        return null;
      /* istanbul ignore next - compile time check for completeness */
      default:
        throwIllegalValue(scannerStatus.state);
    }
  })();
  return (
    <AppContext.Provider
      value={{
        electionDefinition,
        currentPrecinctId,
        currentMarkThresholds,
        machineConfig,
        auth,
      }}
    >
      {voterScreen}
    </AppContext.Provider>
  );
}
