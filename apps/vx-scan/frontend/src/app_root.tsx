import React, { useCallback, useEffect, useReducer } from 'react';
import 'normalize.css';

import {
  Card,
  Provider,
  MarkThresholds,
  PrecinctSelection,
  PollsState,
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
  Hardware,
  Storage,
  usbstick,
  assert,
} from '@votingworks/utils';
import { LogEventId, Logger } from '@votingworks/logging';

import { Scan } from '@votingworks/api';
import { UnconfiguredElectionScreen } from './screens/unconfigured_election_screen';
import { LoadingConfigurationScreen } from './screens/loading_configuration_screen';
import { MachineConfig } from './config/types';

import * as scanner from './api/scan';

import { usePrecinctScannerStatus } from './hooks/use_precinct_scanner_status';
import { ElectionManagerScreen } from './screens/election_manager_screen';
import { InvalidCardScreen } from './screens/invalid_card_screen';
import { PollsNotOpenScreen } from './screens/polls_not_open_screen';
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
import { UnconfiguredPrecinctScreen } from './screens/unconfigured_precinct_screen';
import { rootDebug } from './utils/debug';
import { apiClient } from './api/api';

const debug = rootDebug.extend('app-root');

export interface Props {
  hardware: Hardware;
  card: Card;
  storage: Storage;
  machineConfig: Provider<MachineConfig>;
  logger: Logger;
}

interface HardwareState {
  machineConfig: Readonly<MachineConfig>;
}

export interface State extends HardwareState, Scan.PrecinctScannerConfig {
  isBackendStateLoaded: boolean;
}

const initialHardwareState: Readonly<HardwareState> = {
  machineConfig: {
    machineId: '0000',
    codeVersion: 'dev',
  },
};

const initialState: Readonly<State> = {
  ...initialHardwareState,
  ...Scan.InitialPrecinctScannerConfig,
  isBackendStateLoaded: false,
};

// Sets State.
type AppAction =
  | { type: 'updateTestMode'; isTestMode: boolean }
  | { type: 'resetElectionSession' }
  | {
      type: 'refreshStateFromBackend';
      scannerConfig: Scan.PrecinctScannerConfig;
    }
  | { type: 'updatePrecinctSelection'; precinctSelection: PrecinctSelection }
  | {
      type: 'updateMarkThresholdOverrides';
      markThresholdOverrides?: MarkThresholds;
    }
  | { type: 'updatePollsState'; pollsState: PollsState }
  | { type: 'toggleIsSoundMuted' }
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
    case 'refreshStateFromBackend': {
      return {
        machineConfig: state.machineConfig,
        ...action.scannerConfig,
        isBackendStateLoaded: true,
      };
    }
    case 'resetElectionSession': {
      return {
        ...state,
        pollsState: 'polls_closed_initial',
        ballotCountWhenBallotBagLastReplaced: 0,
      };
    }
    case 'updateTestMode':
      return {
        ...state,
        isTestMode: action.isTestMode,
      };
    case 'updatePrecinctSelection':
      return {
        ...state,
        precinctSelection: action.precinctSelection,
      };
    case 'updateMarkThresholdOverrides':
      return {
        ...state,
        markThresholdOverrides: action.markThresholdOverrides,
      };
    case 'updatePollsState':
      return {
        ...state,
        pollsState: action.pollsState,
      };
    case 'toggleIsSoundMuted':
      return {
        ...state,
        isSoundMuted: !state.isSoundMuted,
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
  storage,
  machineConfig: machineConfigProvider,
  logger,
}: Props): JSX.Element | null {
  const [appState, dispatchAppState] = useReducer(appReducer, initialState);
  const {
    electionDefinition,
    isBackendStateLoaded,
    isTestMode,
    precinctSelection,
    markThresholdOverrides,
    pollsState,
    machineConfig,
    isSoundMuted,
    ballotCountWhenBallotBagLastReplaced,
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
    const scannerConfig = await makeCancelable(apiClient.getConfig());

    dispatchAppState({
      type: 'refreshStateFromBackend',
      scannerConfig,
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

    void initializeScanner();
  }, [refreshConfig, storage]);

  const updatePollsState = useCallback(
    async (newPollsState: PollsState) => {
      await apiClient.setPollsState({ pollsState: newPollsState });
      dispatchAppState({ type: 'updatePollsState', pollsState: newPollsState });
      await refreshConfig();
    },
    [refreshConfig]
  );

  const resetPollsToPaused = useCallback(async () => {
    await updatePollsState('polls_paused');
  }, [updatePollsState]);

  const toggleTestMode = useCallback(async () => {
    await apiClient.setTestMode({ isTestMode: !isTestMode });
    dispatchAppState({ type: 'updateTestMode', isTestMode: !isTestMode });
    dispatchAppState({ type: 'resetElectionSession' });
    await refreshConfig();
  }, [refreshConfig, isTestMode]);

  const toggleIsSoundMuted = useCallback(async () => {
    dispatchAppState({ type: 'toggleIsSoundMuted' });
    await apiClient.setIsSoundMuted({ isSoundMuted: !isSoundMuted });
  }, [isSoundMuted]);

  const unconfigureServer = useCallback(
    async (options: { ignoreBackupRequirement?: boolean } = {}) => {
      try {
        await apiClient.unconfigureElection(options);
        await refreshConfig();
      } catch (error) {
        debug('failed unconfigureServer()', error);
      }
    },
    [refreshConfig]
  );

  async function updatePrecinctSelection(
    newPrecinctSelection: PrecinctSelection
  ) {
    await apiClient.setPrecinctSelection({
      precinctSelection: newPrecinctSelection,
    });
    dispatchAppState({
      type: 'updatePrecinctSelection',
      precinctSelection: newPrecinctSelection,
    });
    await refreshConfig();
  }

  async function updateMarkThresholds(markThresholds?: MarkThresholds) {
    dispatchAppState({
      type: 'updateMarkThresholdOverrides',
      markThresholdOverrides: markThresholds,
    });
    await apiClient.setMarkThresholdOverrides({
      markThresholdOverrides: markThresholds,
    });
  }

  const scannerStatus = usePrecinctScannerStatus();

  const onBallotBagReplaced = useCallback(async () => {
    await apiClient.recordBallotBagReplaced();
    await refreshConfig();
    await logger.log(LogEventId.BallotBagReplaced, 'poll_worker', {
      disposition: 'success',
      message: 'Poll worker confirmed that they replaced the ballot bag.',
    });
  }, [logger, refreshConfig]);

  const needsToReplaceBallotBag =
    scannerStatus &&
    scannerStatus.ballotsCounted >=
      ballotCountWhenBallotBagLastReplaced + BALLOT_BAG_CAPACITY;

  // The scan service waits to receive a command to scan or accept a ballot. The
  // frontend controls when this happens so that ensure we're only scanning when
  // we're in voter mode.
  const voterMode = auth.status === 'logged_out' && auth.reason === 'no_card';
  useEffect(() => {
    async function automaticallyScanAndAcceptBallots() {
      if (
        !(pollsState === 'polls_open' && voterMode && !needsToReplaceBallotBag)
      ) {
        return;
      }

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

  const resetPollsToPausedText =
    'The polls are closed and voting is complete. After resetting the polls to paused, it will be possible to re-open the polls and resume voting. All current cast vote records will be preserved.';

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
          resetPollsToPausedText={resetPollsToPausedText}
          resetPollsToPaused={
            pollsState === 'polls_closed_final' ? resetPollsToPaused : undefined
          }
          isMachineConfigured={Boolean(electionDefinition)}
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

  if (!isBackendStateLoaded) {
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
          precinctSelection,
          markThresholdOverrides,
          machineConfig,
          auth,
          isSoundMuted,
          logger,
        }}
      >
        <ElectionManagerScreen
          updatePrecinctSelection={updatePrecinctSelection}
          scannerStatus={scannerStatus}
          isTestMode={isTestMode}
          pollsState={pollsState}
          toggleLiveMode={toggleTestMode}
          setMarkThresholdOverrides={updateMarkThresholds}
          unconfigure={unconfigureServer}
          usbDrive={usbDrive}
          toggleIsSoundMuted={toggleIsSoundMuted}
        />
      </AppContext.Provider>
    );
  }

  if (!precinctSelection) return <UnconfiguredPrecinctScreen />;

  if (window.kiosk && usbDrive.status !== usbstick.UsbDriveStatus.mounted) {
    return <InsertUsbScreen />;
  }

  if (needsToReplaceBallotBag && scannerStatus.state !== 'accepted') {
    return (
      <ReplaceBallotBagScreen
        scannedBallotCount={scannerStatus.ballotsCounted}
        pollWorkerAuthenticated={isPollWorkerAuth(auth)}
        onComplete={onBallotBagReplaced}
      />
    );
  }

  if (isPollWorkerAuth(auth)) {
    return (
      <AppContext.Provider
        value={{
          electionDefinition,
          precinctSelection,
          markThresholdOverrides,
          machineConfig,
          auth,
          isSoundMuted,
          logger,
        }}
      >
        <PollWorkerScreen
          scannedBallotCount={scannerStatus.ballotsCounted}
          pollsState={pollsState}
          updatePollsState={updatePollsState}
          hasPrinterAttached={!!printerInfo}
          isLiveMode={!isTestMode}
        />
      </AppContext.Provider>
    );
  }

  if (auth.status === 'logged_out' && auth.reason !== 'no_card') {
    return <InvalidCardScreen />;
  }

  // When no card is inserted, we're in "voter" mode
  assert(auth.status === 'logged_out' && auth.reason === 'no_card');

  if (pollsState !== 'polls_open') {
    return (
      <AppContext.Provider
        value={{
          electionDefinition,
          precinctSelection,
          markThresholdOverrides,
          machineConfig,
          auth,
          isSoundMuted,
          logger,
        }}
      >
        <PollsNotOpenScreen
          isLiveMode={!isTestMode}
          pollsState={pollsState}
          showNoChargerWarning={!computer.batteryIsCharging}
          scannedBallotCount={scannerStatus.ballotsCounted}
        />
      </AppContext.Provider>
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
        precinctSelection,
        markThresholdOverrides,
        machineConfig,
        auth,
        isSoundMuted,
        logger,
      }}
    >
      {voterScreen}
    </AppContext.Provider>
  );
}
