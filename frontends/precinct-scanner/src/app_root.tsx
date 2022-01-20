import { ScannerStatus } from '@votingworks/types/api/services/scan';
import React, { useCallback, useEffect, useReducer, useMemo } from 'react';
import { RouteComponentProps } from 'react-router-dom';
import useInterval from '@rooks/use-interval';
import 'normalize.css';
import makeDebug from 'debug';

import {
  AdjudicationReasonInfo,
  OptionalElectionDefinition,
  Provider,
  CastVoteRecord,
  PrecinctId,
  CardDataTypes,
} from '@votingworks/types';
import {
  useCancelablePromise,
  useSmartcard,
  useUsbDrive,
  SetupCardReaderPage,
  useUserSession,
  useHardware,
} from '@votingworks/ui';
import {
  assert,
  throwIllegalValue,
  PrecinctScannerCardTally,
  Card,
  Hardware,
  Storage,
  usbstick,
  Printer,
  PrecinctScannerCardTallySchema,
} from '@votingworks/utils';
import { Logger, LogSource } from '@votingworks/logging';

import { UnconfiguredElectionScreen } from './screens/unconfigured_election_screen';
import { LoadingConfigurationScreen } from './screens/loading_configuration_screen';
import {
  BallotState,
  ScanningResultType,
  RejectedScanningReason,
  MachineConfig,
} from './config/types';
import {
  POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  TIME_TO_DISMISS_ERROR_SUCCESS_SCREENS_MS,
  HARDWARE_POLLING_INTERVAL,
  LOW_BATTERY_THRESHOLD,
} from './config/globals';

import * as config from './api/config';
import * as scan from './api/scan';

import { usePrecinctScanner } from './hooks/use_precinct_scanner';
import { AdminScreen } from './screens/admin_screen';
import { InvalidCardScreen } from './screens/invalid_card_screen';
import { PollsClosedScreen } from './screens/polls_closed_screen';
import { PollWorkerScreen } from './screens/poll_worker_screen';
import { InsertBallotScreen } from './screens/insert_ballot_screen';
import { ScanErrorScreen } from './screens/scan_error_screen';
import { ScanSuccessScreen } from './screens/scan_success_screen';
import { ScanWarningScreen } from './screens/scan_warning_screen';
import { ScanProcessingScreen } from './screens/scan_processing_screen';
import { AppContext } from './contexts/app_context';
import { SetupPowerPage } from './screens/setup_power_page';
import { UnlockAdminScreen } from './screens/unlock_admin_screen';

const debug = makeDebug('precinct-scanner:app-root');

export interface AppStorage {
  state?: Partial<State>;
}

export const stateStorageKey = 'state';
const VALID_USERS: CardDataTypes[] = ['admin', 'pollworker'];

export interface Props extends RouteComponentProps {
  hardware: Hardware;
  card: Card;
  storage: Storage;
  printer: Printer;
  machineConfig: Provider<MachineConfig>;
}

interface HardwareState {
  hasChargerAttached: boolean;
  hasLowBattery: boolean;
  adminCardElectionHash: string;
  invalidCardPresent: boolean;
  machineConfig: Readonly<MachineConfig>;
}

interface ScanInformationState {
  adjudicationReasonInfo: AdjudicationReasonInfo[];
  rejectionReason?: RejectedScanningReason;
}

interface SharedState {
  electionDefinition: OptionalElectionDefinition;
  isScannerConfigured: boolean;
  isTestMode: boolean;
  scannedBallotCount: number;
  ballotState: BallotState;
  timeoutToInsertScreen?: number;
  isStatusPollingEnabled: boolean;
  currentPrecinctId?: PrecinctId;
  isPollsOpen: boolean;
}

export interface State
  extends HardwareState,
    SharedState,
    ScanInformationState {}

const initialHardwareState: Readonly<HardwareState> = {
  hasChargerAttached: true,
  hasLowBattery: false,
  adminCardElectionHash: '',
  // TODO add concept for invalid card to current user session object
  invalidCardPresent: false,
  machineConfig: {
    machineId: '0000',
    codeVersion: 'dev',
    bypassAuthentication: false,
  },
};

const initialSharedState: Readonly<SharedState> = {
  electionDefinition: undefined,
  isScannerConfigured: false,
  isTestMode: false,
  scannedBallotCount: 0,
  ballotState: BallotState.IDLE,
  isStatusPollingEnabled: true,
  currentPrecinctId: undefined,
  isPollsOpen: false,
};

const initialScanInformationState: Readonly<ScanInformationState> = {
  adjudicationReasonInfo: [],
  rejectionReason: undefined,
};

const initialAppState: Readonly<State> = {
  ...initialHardwareState,
  ...initialSharedState,
  ...initialScanInformationState,
};

// Sets State.
type AppAction =
  | { type: 'initializeAppState'; isPollsOpen: boolean }
  | { type: 'unconfigureScanner' }
  | { type: 'resetPollsToClosed' }
  | {
      type: 'updateElectionDefinition';
      electionDefinition: OptionalElectionDefinition;
    }
  | {
      type: 'refreshConfigFromScanner';
      electionDefinition: OptionalElectionDefinition;
      isTestMode: boolean;
      currentPrecinctId?: PrecinctId;
    }
  | {
      type: 'ballotScanning';
    }
  | {
      type: 'ballotCast';
      timeoutToInsertScreen: number;
    }
  | {
      type: 'ballotNeedsReview';
      adjudicationReasonInfo: AdjudicationReasonInfo[];
    }
  | {
      type: 'ballotRejected';
      rejectionReason?: RejectedScanningReason;
    }
  | {
      type: 'scannerError';
      timeoutToInsertScreen: number;
    }
  | {
      type: 'readyToInsertBallot';
    }
  | { type: 'disableStatusPolling' }
  | { type: 'enableStatusPolling' }
  | { type: 'updatePrecinctId'; precinctId?: PrecinctId }
  | { type: 'togglePollsOpen' }
  | { type: 'setMachineConfig'; machineConfig: MachineConfig }
  | { type: 'updateHardwareState'; hardwareState: Partial<HardwareState> };

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
      };
    case 'updateElectionDefinition':
      return {
        ...state,
        electionDefinition: action.electionDefinition,
        isPollsOpen: false,
      };
    case 'resetPollsToClosed':
      return {
        ...state,
        isPollsOpen: false,
      };
    case 'refreshConfigFromScanner': {
      return {
        ...state,
        electionDefinition: action.electionDefinition,
        currentPrecinctId: action.currentPrecinctId,
        isTestMode: action.isTestMode,
        isScannerConfigured: true,
      };
    }
    case 'unconfigureScanner':
      return {
        ...state,
        isScannerConfigured: false,
        isPollsOpen: false,
      };
    case 'ballotScanning':
      return {
        ...state,
        ...initialScanInformationState,
        ballotState: BallotState.SCANNING,
        timeoutToInsertScreen: undefined,
      };
    case 'ballotCast':
      return {
        ...state,
        ...initialScanInformationState,
        ballotState: BallotState.CAST,
        timeoutToInsertScreen: action.timeoutToInsertScreen,
      };
    case 'scannerError':
      return {
        ...state,
        ...initialScanInformationState,
        ballotState: BallotState.SCANNER_ERROR,
        timeoutToInsertScreen: action.timeoutToInsertScreen,
      };
    case 'ballotRejected':
      return {
        ...state,
        ...initialScanInformationState,
        rejectionReason: action.rejectionReason,
        ballotState: BallotState.REJECTED,
      };
    case 'ballotNeedsReview':
      return {
        ...state,
        ...initialScanInformationState,
        adjudicationReasonInfo: action.adjudicationReasonInfo,
        ballotState: BallotState.NEEDS_REVIEW,
      };
    case 'readyToInsertBallot':
      return {
        ...state,
        ...initialScanInformationState,
        ballotState: BallotState.IDLE,
        timeoutToInsertScreen: undefined,
      };
    case 'disableStatusPolling':
      return {
        ...state,
        isStatusPollingEnabled: false,
      };
    case 'enableStatusPolling':
      return {
        ...state,
        isStatusPollingEnabled: true,
      };
    case 'updatePrecinctId':
      return {
        ...state,
        currentPrecinctId: action.precinctId,
        isPollsOpen: false,
      };
    case 'togglePollsOpen':
      return {
        ...state,
        isPollsOpen: !state.isPollsOpen,
      };
    case 'setMachineConfig':
      return {
        ...state,
        machineConfig:
          action.machineConfig ?? initialHardwareState.machineConfig,
      };
    case 'updateHardwareState':
      return {
        ...state,
        ...action.hardwareState,
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
}: Props): JSX.Element {
  const [appState, dispatchAppState] = useReducer(appReducer, initialAppState);
  const {
    electionDefinition,
    isScannerConfigured,
    ballotState,
    timeoutToInsertScreen,
    isStatusPollingEnabled,
    adjudicationReasonInfo,
    rejectionReason,
    isTestMode,
    currentPrecinctId,
    isPollsOpen,
    machineConfig,
    hasLowBattery,
    hasChargerAttached,
  } = appState;

  const logger = useMemo(
    () => new Logger(LogSource.VxPrecinctScanFrontend, window.kiosk),
    []
  );
  const usbDrive = useUsbDrive({ logger });
  const usbDriveDisplayStatus =
    usbDrive.status ?? usbstick.UsbDriveStatus.absent;

  const { hasCardReaderAttached, hasPrinterAttached } = useHardware({
    hardware,
    logger,
  });
  const smartcard = useSmartcard({
    card,
    hasCardReaderAttached,
  });
  const { currentUserSession, attemptToAuthenticateAdminUser } = useUserSession(
    {
      smartcard,
      electionDefinition,
      persistAuthentication: false,
      bypassAuthentication: machineConfig.bypassAuthentication,
      logger,
      validUserTypes: VALID_USERS,
    }
  );
  const hasCardInserted = currentUserSession?.type;

  const makeCancelable = useCancelablePromise();

  const refreshConfig = useCallback(async () => {
    const newElectionDefinition = await makeCancelable(
      config.getElectionDefinition()
    );
    const newIsTestMode = await makeCancelable(config.getTestMode());
    const newCurrentPrecinctId = await makeCancelable(
      config.getCurrentPrecinctId()
    );
    dispatchAppState({
      type: 'refreshConfigFromScanner',
      electionDefinition: newElectionDefinition,
      isTestMode: newIsTestMode,
      currentPrecinctId: newCurrentPrecinctId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchAppState]);

  const dismissCurrentBallotMessage = useCallback((): number => {
    return window.setTimeout(
      () => dispatchAppState({ type: 'readyToInsertBallot' }),
      TIME_TO_DISMISS_ERROR_SUCCESS_SCREENS_MS
    );
  }, [dispatchAppState]);

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

  const scanDetectedBallot = useCallback(async () => {
    dispatchAppState({ type: 'disableStatusPolling' });
    try {
      const scanningResult = await scan.scanDetectedSheet();
      switch (scanningResult.resultType) {
        case ScanningResultType.Rejected: {
          dispatchAppState({
            type: 'ballotRejected',
            rejectionReason: scanningResult.rejectionReason,
          });
          break;
        }
        case ScanningResultType.NeedsReview:
          dispatchAppState({
            type: 'ballotNeedsReview',
            adjudicationReasonInfo: scanningResult.adjudicationReasonInfo,
          });
          break;
        case ScanningResultType.Accepted: {
          dispatchAppState({
            type: 'ballotCast',
            timeoutToInsertScreen: dismissCurrentBallotMessage(),
          });
          break;
        }
        /* istanbul ignore next - compile time check for completeness */
        default:
          throwIllegalValue(scanningResult);
      }
    } catch (error) {
      /* istanbul ignore next */
      dispatchAppState({
        type: 'ballotRejected',
      });
    } finally {
      dispatchAppState({
        type: 'enableStatusPolling',
      });
    }
  }, [dispatchAppState, dismissCurrentBallotMessage]);

  const acceptBallot = useCallback(async () => {
    try {
      dispatchAppState({
        type: 'disableStatusPolling',
      });
      dispatchAppState({
        type: 'ballotScanning',
      });
      const success = await scan.acceptBallotAfterReview();
      if (success) {
        dispatchAppState({
          type: 'ballotCast',
          timeoutToInsertScreen: dismissCurrentBallotMessage(),
        });
      } else {
        dispatchAppState({
          type: 'ballotRejected',
        });
      }
    } finally {
      dispatchAppState({
        type: 'enableStatusPolling',
      });
    }
  }, [dispatchAppState, dismissCurrentBallotMessage]);

  const endBatch = useCallback(async () => {
    dispatchAppState({ type: 'disableStatusPolling' });
    try {
      await scan.endBatch();
    } finally {
      dispatchAppState({
        type: 'enableStatusPolling',
      });
    }
  }, [dispatchAppState]);

  // Hardware status polling to set hasCharger and hasLowBattery parameters
  const hardwareStatusInterval = useInterval(
    async () => {
      const battery = await hardware.readBatteryStatus();
      if (!battery) {
        dispatchAppState({
          type: 'updateHardwareState',
          hardwareState: {
            hasChargerAttached: true,
            hasLowBattery: false,
          },
        });
      } else {
        const newHasLowBattery = battery.level < LOW_BATTERY_THRESHOLD;
        const hasHardwareStateChanged =
          hasChargerAttached !== !battery.discharging ||
          hasLowBattery !== newHasLowBattery;
        if (hasHardwareStateChanged) {
          dispatchAppState({
            type: 'updateHardwareState',
            hardwareState: {
              hasChargerAttached: !battery.discharging,
              hasLowBattery: newHasLowBattery,
            },
          });
        }
      }
    },
    HARDWARE_POLLING_INTERVAL,
    true
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startHardwareStatusPolling = useCallback(hardwareStatusInterval[0], [
    hardware,
  ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stopHardwareStatusPolling = useCallback(hardwareStatusInterval[1], [
    hardware,
  ]);

  const [startBallotStatusPolling, endBallotStatusPolling] = useInterval(
    async () => {
      if (!isStatusPollingEnabled) {
        return;
      }
      dispatchAppState({ type: 'disableStatusPolling' });

      try {
        const { scannerState } = await scan.getCurrentStatus();

        const isCapableOfBeginningNewScan =
          ballotState === BallotState.IDLE ||
          ballotState === BallotState.CAST ||
          ballotState === BallotState.SCANNER_ERROR;

        const isHoldingPaperForVoterRemoval =
          ballotState === BallotState.REJECTED ||
          ballotState === BallotState.NEEDS_REVIEW;

        debug({
          scannerState,
          ballotState,
          isCapableOfBeginningNewScan,
          isHoldingPaperForVoterRemoval,
        });

        // Figure out what ballot state we are in, defaulting to the current state.
        switch (scannerState) {
          case ScannerStatus.Error:
          case ScannerStatus.Unknown: {
            // The scanner returned an error move to the error screen. Assume there is not currently paper in the scanner.
            // TODO(531) Bugs in services/scan make this happen at confusing moments, ignore for now.
            debug('got a bad scanner status', scannerState);
            /* dispatchAppState({
            type: 'scannerError',
            timeoutToInsertScreen: dismissCurrentBallotMessage(),
          }) */
            return;
          }
          case ScannerStatus.ReadyToScan:
            if (isCapableOfBeginningNewScan) {
              // If we are going to reset the machine back to the insert ballot screen, cancel that.
              if (timeoutToInsertScreen) {
                window.clearTimeout(timeoutToInsertScreen);
              }
              // begin scanning
              dispatchAppState({
                type: 'ballotScanning',
              });
              await scanDetectedBallot();
            }
            return;
          case ScannerStatus.WaitingForPaper:
            // When we can not begin a new scan we are not expecting to be waiting for paper
            // This will happen if someone is ripping the paper out of the scanner while scanning, or reviewing
            // a ballot.
            if (isHoldingPaperForVoterRemoval) {
              // The voter has removed the ballot, end the batch and reset to the insert screen.
              await endBatch();
              /* istanbul ignore next */
              if (timeoutToInsertScreen) {
                window.clearTimeout(timeoutToInsertScreen);
              }
              dispatchAppState({ type: 'readyToInsertBallot' });
              return;
            }
            break;

          default:
            // nothing to do
            break;
        }
      } catch (err) {
        debug('error in fetching module scan status');
      } finally {
        dispatchAppState({ type: 'enableStatusPolling' });
      }
    },
    POLLING_INTERVAL_FOR_SCANNER_STATUS_MS
  );

  const togglePollsOpen = useCallback(() => {
    dispatchAppState({ type: 'togglePollsOpen' });
  }, []);

  useEffect(() => {
    if (
      isScannerConfigured &&
      electionDefinition &&
      isPollsOpen &&
      !hasCardInserted
    ) {
      startBallotStatusPolling();
    } else {
      endBallotStatusPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScannerConfigured, electionDefinition, isPollsOpen, hasCardInserted]);

  const setElectionDefinition = useCallback(
    async (newElectionDefinition: OptionalElectionDefinition) => {
      dispatchAppState({
        type: 'updateElectionDefinition',
        electionDefinition: newElectionDefinition,
      });
      await refreshConfig();
    },
    [dispatchAppState, refreshConfig]
  );

  const toggleTestMode = useCallback(async () => {
    await config.setTestMode(!isTestMode);
    dispatchAppState({ type: 'resetPollsToClosed' });
    await refreshConfig();
  }, [dispatchAppState, refreshConfig, isTestMode]);

  const unconfigureServer = useCallback(async () => {
    try {
      await config.setElection(undefined);
      endBallotStatusPolling();
      dispatchAppState({ type: 'resetPollsToClosed' });
      await refreshConfig();
    } catch (error) {
      debug('failed unconfigureServer()', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatchAppState, refreshConfig]);

  const scanner = usePrecinctScanner();
  const scannedBallotCount = scanner?.status.ballotCount ?? 0;

  const getCvrsFromExport = useCallback(async (): Promise<CastVoteRecord[]> => {
    if (electionDefinition) {
      return await scan.getExport();
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [electionDefinition, scannedBallotCount]);

  const saveTallyToCard = useCallback(
    async (cardTally: PrecinctScannerCardTally): Promise<boolean> => {
      await card.writeLongObject(cardTally);
      const possibleTally = await card.readLongObject(
        PrecinctScannerCardTallySchema
      );
      return possibleTally.ok()?.timeSaved === cardTally.timeSaved;
    },
    [card]
  );

  // Initialize app state
  useEffect(() => {
    async function initializeScanner() {
      try {
        await refreshConfig();
      } catch (e) {
        debug('failed to initialize:', e);
        dispatchAppState({
          type: 'unconfigureScanner',
        });
        endBallotStatusPolling();
        window.setTimeout(initializeScanner, 1000);
      }
    }

    async function updateStateFromStorage() {
      const storedAppState: Partial<State> =
        ((await storage.get(stateStorageKey)) as Partial<State> | undefined) ||
        {};
      const {
        isPollsOpen: storedIsPollsOpen = initialAppState.isPollsOpen,
      } = storedAppState;
      dispatchAppState({
        type: 'initializeAppState',
        isPollsOpen: storedIsPollsOpen,
      });
    }

    void initializeScanner();
    void updateStateFromStorage();
    startHardwareStatusPolling();
    return () => {
      stopHardwareStatusPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    refreshConfig,
    storage,
    startHardwareStatusPolling,
    stopHardwareStatusPolling,
  ]);

  const updatePrecinctId = useCallback(
    async (precinctId: PrecinctId) => {
      dispatchAppState({ type: 'updatePrecinctId', precinctId });
      await config.setCurrentPrecinctId(precinctId);
    },
    [dispatchAppState]
  );

  useEffect(() => {
    async function storeAppState() {
      await storage.set(stateStorageKey, {
        isPollsOpen,
      });
    }

    void storeAppState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPollsOpen]);

  function dismissError() {
    /* istanbul ignore next */
    if (timeoutToInsertScreen) {
      window.clearTimeout(timeoutToInsertScreen);
    }
    dispatchAppState({ type: 'readyToInsertBallot' });
  }

  if (!hasCardReaderAttached) {
    return <SetupCardReaderPage />;
  }

  if (hasLowBattery && !hasChargerAttached) {
    return <SetupPowerPage />;
  }

  if (!isScannerConfigured) {
    return <LoadingConfigurationScreen />;
  }

  if (!electionDefinition) {
    return (
      <UnconfiguredElectionScreen
        usbDriveStatus={usbDriveDisplayStatus}
        setElectionDefinition={setElectionDefinition}
      />
    );
  }

  if (currentUserSession?.type === 'admin') {
    return (
      <AppContext.Provider
        value={{
          electionDefinition,
          currentPrecinctId,
          machineConfig,
          currentUserSession,
        }}
      >
        {currentUserSession.authenticated ? (
          <AdminScreen
            updateAppPrecinctId={updatePrecinctId}
            scannedBallotCount={scannedBallotCount}
            isTestMode={isTestMode}
            toggleLiveMode={toggleTestMode}
            unconfigure={unconfigureServer}
            calibrate={scan.calibrate}
            usbDrive={usbDrive}
          />
        ) : (
          <UnlockAdminScreen
            attemptToAuthenticateUser={attemptToAuthenticateAdminUser}
          />
        )}
      </AppContext.Provider>
    );
  }

  if (
    currentUserSession?.type === 'pollworker' &&
    currentUserSession.authenticated
  ) {
    return (
      <AppContext.Provider
        value={{
          electionDefinition,
          currentPrecinctId,
          machineConfig,
          currentUserSession,
        }}
      >
        <PollWorkerScreen
          scannedBallotCount={scannedBallotCount}
          isPollsOpen={isPollsOpen}
          togglePollsOpen={togglePollsOpen}
          saveTallyToCard={saveTallyToCard}
          getCvrsFromExport={getCvrsFromExport}
          printer={printer}
          hasPrinterAttached={hasPrinterAttached}
          isLiveMode={!isTestMode}
          usbDrive={usbDrive}
        />
      </AppContext.Provider>
    );
  }

  if (
    currentUserSession?.type === 'voter' ||
    currentUserSession?.type === 'unknown' ||
    currentUserSession?.authenticated === false
  ) {
    return <InvalidCardScreen />;
  }

  assert(currentUserSession === undefined);

  let voterScreen = (
    <PollsClosedScreen
      isLiveMode={!isTestMode}
      showNoChargerWarning={!hasChargerAttached}
    />
  );

  // The polls are open for voters to utilize.
  if (isPollsOpen) {
    switch (ballotState) {
      case BallotState.IDLE: {
        voterScreen = (
          <InsertBallotScreen
            isLiveMode={!isTestMode}
            scannedBallotCount={scannedBallotCount}
            showNoChargerWarning={!hasChargerAttached}
          />
        );
        break;
      }
      case BallotState.SCANNING: {
        voterScreen = <ScanProcessingScreen />;
        break;
      }
      case BallotState.NEEDS_REVIEW: {
        voterScreen = (
          <ScanWarningScreen
            acceptBallot={acceptBallot}
            adjudicationReasonInfo={adjudicationReasonInfo}
          />
        );
        break;
      }
      case BallotState.CAST: {
        voterScreen = (
          <ScanSuccessScreen scannedBallotCount={scannedBallotCount} />
        );
        break;
      }
      case BallotState.SCANNER_ERROR: {
        voterScreen = (
          <ScanErrorScreen
            dismissError={dismissError}
            isTestMode={isTestMode}
          />
        );
        break;
      }
      case BallotState.REJECTED: {
        voterScreen = (
          <ScanErrorScreen
            rejectionReason={rejectionReason}
            isTestMode={isTestMode}
          />
        );
        break;
      }
      /* istanbul ignore next - compile time check for completeness */
      default:
        throwIllegalValue(ballotState);
    }
  }
  return (
    <AppContext.Provider
      value={{
        electionDefinition,
        machineConfig,
        currentPrecinctId,
        currentUserSession,
      }}
    >
      {voterScreen}
    </AppContext.Provider>
  );
}
