import { Scan } from '@votingworks/api';
import React, { useCallback, useEffect, useReducer } from 'react';
import useInterval from '@rooks/use-interval';
import 'normalize.css';
import makeDebug from 'debug';

import {
  AdjudicationReasonInfo,
  OptionalElectionDefinition,
  Provider,
  CastVoteRecord,
  PrecinctId,
  ElectionDefinition,
} from '@votingworks/types';
import {
  useCancelablePromise,
  useUsbDrive,
  SetupCardReaderPage,
  useDevices,
  RebootFromUsbButton,
  Button,
  UnlockMachineScreen,
  useInsertedSmartcardAuth,
  isSuperadminAuth,
  isAdminAuth,
  isPollworkerAuth,
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
import {
  BallotState,
  ScanningResultType,
  RejectedScanningReason,
  MachineConfig,
} from './config/types';
import {
  POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  TIME_TO_DISMISS_ERROR_SUCCESS_SCREENS_MS,
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
import { CardErrorScreen } from './screens/card_error_screen';
import { SetupScannerScreen } from './screens/setup_scanner_screen';
import { SetupScannerInternalWiringScreen } from './screens/setup_scanner_internal_wiring_screen';
import { ScreenMainCenterChild, CenteredLargeProse } from './components/layout';
import { InsertUsbScreen } from './screens/insert_usb_screen';

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
  isTestMode: boolean;
  currentPrecinctId?: PrecinctId;
}

interface SharedState {
  scannedBallotCount: number;
  ballotState: BallotState;
  timeoutToInsertScreen?: number;
  isStatusPollingEnabled: boolean;
  isPollsOpen: boolean;
  initializedFromStorage: boolean;
}

interface ScanInformationState {
  adjudicationReasonInfo: AdjudicationReasonInfo[];
  rejectionReason?: RejectedScanningReason;
}

export interface State
  extends HardwareState,
    ScannerConfigState,
    SharedState,
    ScanInformationState {}

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
  currentPrecinctId: undefined,
};

const initialSharedState: Readonly<SharedState> = {
  scannedBallotCount: 0,
  ballotState: BallotState.IDLE,
  isStatusPollingEnabled: true,
  isPollsOpen: false,
  initializedFromStorage: false,
};

const initialScanInformationState: Readonly<ScanInformationState> = {
  adjudicationReasonInfo: [],
  rejectionReason: undefined,
};

const initialAppState: Readonly<State> = {
  ...initialHardwareState,
  ...initialScannerConfigState,
  ...initialSharedState,
  ...initialScanInformationState,
};

// Sets State.
type AppAction =
  | { type: 'initializeAppState'; isPollsOpen: boolean }
  | { type: 'resetPollsToClosed' }
  | {
      type: 'updateElectionDefinition';
      electionDefinition: OptionalElectionDefinition;
    }
  | {
      type: 'refreshConfigFromScanner';
      electionDefinition?: ElectionDefinition;
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
        initializedFromStorage: true,
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
        isScannerConfigLoaded: true,
      };
    }
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
}: Props): JSX.Element {
  const [appState, dispatchAppState] = useReducer(appReducer, initialAppState);
  const {
    electionDefinition,
    isScannerConfigLoaded,
    ballotState,
    timeoutToInsertScreen,
    isStatusPollingEnabled,
    adjudicationReasonInfo,
    rejectionReason,
    isTestMode,
    currentPrecinctId,
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
    precinctScanner,
  } = useDevices({
    hardware,
    logger,
  });
  const auth = useInsertedSmartcardAuth({
    allowedUserRoles: ['superadmin', 'admin', 'pollworker'],
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
          case Scan.ScannerStatus.Error:
          case Scan.ScannerStatus.Unknown: {
            // The scanner returned an error move to the error screen. Assume there is not currently paper in the scanner.
            // TODO(531) Bugs in services/scan make this happen at confusing moments, ignore for now.
            debug('got a bad scanner status', scannerState);
            /* dispatchAppState({
            type: 'scannerError',
            timeoutToInsertScreen: dismissCurrentBallotMessage(),
          }) */
            return;
          }
          case Scan.ScannerStatus.ReadyToScan:
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
          case Scan.ScannerStatus.WaitingForPaper:
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
      precinctScanner &&
      electionDefinition &&
      isPollsOpen &&
      auth.status === 'logged_out' &&
      auth.reason === 'no_card'
    ) {
      startBallotStatusPolling();
    } else {
      endBallotStatusPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precinctScanner, electionDefinition, isPollsOpen, auth]);

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
  const canUnconfigure = scanner?.status.canUnconfigure ?? false;

  const getCvrsFromExport = useCallback(async (): Promise<CastVoteRecord[]> => {
    if (electionDefinition) {
      const castVoteRecordsString = await scan.getExport();

      const lines = castVoteRecordsString.split('\n');
      const cvrs = lines.flatMap((line) =>
        line.length > 0 ? (JSON.parse(line) as CastVoteRecord) : []
      );
      // TODO add more validation of the CVR, move the validation code from election-manager to utils
      return cvrs.filter((cvr) => cvr._precinctId !== undefined);
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [electionDefinition, scannedBallotCount]);

  // Initialize app state
  useEffect(() => {
    async function initializeScanner() {
      try {
        await refreshConfig();
      } catch (e) {
        debug('failed to initialize:', e);
        endBallotStatusPolling();
        window.setTimeout(initializeScanner, 1000);
      }
    }

    async function updateStateFromStorage() {
      const storedAppState: Partial<State> =
        ((await storage.get(stateStorageKey)) as Partial<State> | undefined) ||
        {};
      const { isPollsOpen: storedIsPollsOpen = initialAppState.isPollsOpen } =
        storedAppState;
      dispatchAppState({
        type: 'initializeAppState',
        isPollsOpen: storedIsPollsOpen,
      });
    }

    void initializeScanner();
    void updateStateFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshConfig, storage]);

  const updatePrecinctId = useCallback(
    async (precinctId: PrecinctId) => {
      dispatchAppState({ type: 'updatePrecinctId', precinctId });
      await config.setCurrentPrecinctId(precinctId);
    },
    [dispatchAppState]
  );

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

  function dismissError() {
    /* istanbul ignore next */
    if (timeoutToInsertScreen) {
      window.clearTimeout(timeoutToInsertScreen);
    }
    dispatchAppState({ type: 'readyToInsertBallot' });
  }

  if (!cardReader) {
    return <SetupCardReaderPage />;
  }

  if (auth.status === 'logged_out' && auth.reason === 'card_error') {
    return <CardErrorScreen />;
  }

  if (computer.batteryIsLow && !computer.batteryIsCharging) {
    return <SetupPowerPage />;
  }

  if (isSuperadminAuth(auth)) {
    return (
      <ScreenMainCenterChild infoBar>
        <CenteredLargeProse>
          <RebootFromUsbButton
            usbDriveStatus={usbDriveDisplayStatus}
            logger={logger}
          />
          <br />
          <br />
          <Button onPress={() => window.kiosk?.quit()}>Reset</Button>
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }

  // If the power cord is plugged in, but we can't detect a scanner, it's an internal wiring issue
  if (computer.batteryIsCharging && !precinctScanner) {
    return <SetupScannerInternalWiringScreen />;
  }

  // Otherwise if we can't detect the scanner, the power cord is likely not plugged in
  if (!precinctScanner) {
    return <SetupScannerScreen />;
  }

  if (!isScannerConfigLoaded) {
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

  if (auth.status === 'checking_passcode') {
    return <UnlockMachineScreen auth={auth} />;
  }

  if (isAdminAuth(auth)) {
    return (
      <AppContext.Provider
        value={{
          electionDefinition,
          currentPrecinctId,
          machineConfig,
          auth,
        }}
      >
        <AdminScreen
          updateAppPrecinctId={updatePrecinctId}
          scannedBallotCount={scannedBallotCount}
          canUnconfigure={canUnconfigure}
          isTestMode={isTestMode}
          toggleLiveMode={toggleTestMode}
          unconfigure={unconfigureServer}
          calibrate={scan.calibrate}
          usbDrive={usbDrive}
        />
      </AppContext.Provider>
    );
  }

  if (window.kiosk && usbDrive.status !== usbstick.UsbDriveStatus.mounted) {
    return <InsertUsbScreen />;
  }

  if (isPollworkerAuth(auth)) {
    return (
      <AppContext.Provider
        value={{
          electionDefinition,
          currentPrecinctId,
          machineConfig,
          auth,
        }}
      >
        <PollWorkerScreen
          scannedBallotCount={scannedBallotCount}
          isPollsOpen={isPollsOpen}
          togglePollsOpen={togglePollsOpen}
          getCvrsFromExport={getCvrsFromExport}
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

  let voterScreen = (
    <PollsClosedScreen
      isLiveMode={!isTestMode}
      showNoChargerWarning={!computer.batteryIsCharging}
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
            showNoChargerWarning={!computer.batteryIsCharging}
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
        auth,
      }}
    >
      {voterScreen}
    </AppContext.Provider>
  );
}
