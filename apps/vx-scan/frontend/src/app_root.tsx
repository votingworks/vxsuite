import React, { useCallback, useEffect } from 'react';
import 'normalize.css';

import { Card, MarkThresholds, PrecinctSelection } from '@votingworks/types';
import {
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
import { throwIllegalValue, Hardware, assert } from '@votingworks/utils';
import { LogEventId, Logger } from '@votingworks/logging';

import { UnconfiguredElectionScreen } from './screens/unconfigured_election_screen';
import { LoadingConfigurationScreen } from './screens/loading_configuration_screen';

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
import {
  BALLOT_BAG_CAPACITY,
  POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
} from './config/globals';
import { UnconfiguredPrecinctScreen } from './screens/unconfigured_precinct_screen';
import { rootDebug } from './utils/debug';
import {
  acceptBallot,
  getConfig,
  getMachineConfig,
  getScannerStatus,
  recordBallotBagReplaced,
  scanBallot,
  setIsSoundMuted,
  setMarkThresholdOverrides,
  setPollsState,
  setPrecinctSelection,
  setTestMode,
  unconfigureElection,
} from './api';

const debug = rootDebug.extend('app-root');

export interface Props {
  hardware: Hardware;
  card: Card;
  logger: Logger;
}

export function AppRoot({ hardware, card, logger }: Props): JSX.Element | null {
  const machineConfigQuery = getMachineConfig.useQuery();
  const configQuery = getConfig.useQuery();
  const setPollsStateMutation = setPollsState.useMutation();

  const usbDrive = useUsbDrive({ logger });

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
    scope: { electionDefinition: configQuery.data?.electionDefinition },
    logger,
  });

  const setTestModeMutation = setTestMode.useMutation();
  const toggleTestMode = useCallback(async () => {
    assert(configQuery.isSuccess);
    await setTestModeMutation.mutateAsync({
      isTestMode: !configQuery.data.isTestMode,
    });
  }, [
    setTestModeMutation,
    configQuery.isSuccess,
    configQuery.data?.isTestMode,
  ]);

  const setIsSoundMutedMutation = setIsSoundMuted.useMutation();
  const toggleIsSoundMuted = useCallback(async () => {
    assert(configQuery.isSuccess);
    await setIsSoundMutedMutation.mutateAsync({
      isSoundMuted: !configQuery.data.isSoundMuted,
    });
  }, [
    setIsSoundMutedMutation,
    configQuery.isSuccess,
    configQuery.data?.isSoundMuted,
  ]);

  const unconfigureElectionMutation = unconfigureElection.useMutation();
  const unconfigureServer = useCallback(
    async (options: { ignoreBackupRequirement?: boolean } = {}) => {
      try {
        await unconfigureElectionMutation.mutateAsync(options);
      } catch (error) {
        debug('failed unconfigureServer()', error);
      }
    },
    [unconfigureElectionMutation]
  );

  const setPrecinctSelectionMutation = setPrecinctSelection.useMutation();
  async function updatePrecinctSelection(
    newPrecinctSelection: PrecinctSelection
  ) {
    await setPrecinctSelectionMutation.mutateAsync({
      precinctSelection: newPrecinctSelection,
    });
  }

  const setMarkThresholdOverridesMutation =
    setMarkThresholdOverrides.useMutation();
  async function updateMarkThresholds(
    newMarkThresholdOverrides?: MarkThresholds
  ) {
    await setMarkThresholdOverridesMutation.mutateAsync({
      markThresholdOverrides: newMarkThresholdOverrides,
    });
  }

  const scannerStatusQuery = getScannerStatus.useQuery({
    refetchInterval: POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  });
  const scannerStatus = scannerStatusQuery.data;

  const recordBallotBagReplacedMutation = recordBallotBagReplaced.useMutation();
  const onBallotBagReplaced = useCallback(async () => {
    await recordBallotBagReplacedMutation.mutateAsync();
    await logger.log(LogEventId.BallotBagReplaced, 'poll_worker', {
      disposition: 'success',
      message: 'Poll worker confirmed that they replaced the ballot bag.',
    });
    // TODO(jonah): Refactor replace ballot bag flow to not call this function
    // whenever the function identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logger]);

  const needsToReplaceBallotBag =
    configQuery.isSuccess &&
    scannerStatus &&
    scannerStatus.ballotsCounted >=
      configQuery.data.ballotCountWhenBallotBagLastReplaced +
        BALLOT_BAG_CAPACITY;

  // The scan service waits to receive a command to scan or accept a ballot. The
  // frontend controls when this happens so that ensure we're only scanning when
  // we're in voter mode.
  const voterMode = auth.status === 'logged_out' && auth.reason === 'no_card';
  const scanBallotMutation = scanBallot.useMutation();
  const acceptBallotMutation = acceptBallot.useMutation();
  useEffect(
    () => {
      async function automaticallyScanAndAcceptBallots() {
        if (!configQuery.isSuccess) return;
        if (
          !(
            configQuery.data.pollsState === 'polls_open' &&
            voterMode &&
            !needsToReplaceBallotBag
          )
        ) {
          return;
        }

        if (scannerStatus?.state === 'ready_to_scan') {
          await scanBallotMutation.mutateAsync();
        } else if (scannerStatus?.state === 'ready_to_accept') {
          await acceptBallotMutation.mutateAsync();
        }
      }
      void automaticallyScanAndAcceptBallots();
    },
    // TODO(jonah): Instead of using dependencies to control when this hook
    // re-runs, refactor so that this effect only runs in voter mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      configQuery.data?.pollsState,
      configQuery.isSuccess,
      needsToReplaceBallotBag,
      scannerStatus?.state,
      voterMode,
    ]
  );

  if (!(machineConfigQuery.isSuccess && configQuery.isSuccess)) {
    return <LoadingConfigurationScreen />;
  }

  const machineConfig = machineConfigQuery.data;
  const {
    electionDefinition,
    isTestMode,
    precinctSelection,
    markThresholdOverrides,
    pollsState,
    isSoundMuted,
  } = configQuery.data;

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
          resetPollsToPausedText="The polls are closed and voting is complete. After resetting the polls to paused, it will be possible to re-open the polls and resume voting. All current cast vote records will be preserved."
          resetPollsToPaused={
            pollsState === 'polls_closed_final'
              ? () =>
                  setPollsStateMutation.mutateAsync({
                    pollsState: 'polls_paused',
                  })
              : undefined
          }
          isMachineConfigured={Boolean(electionDefinition)}
          usbDriveStatus={usbDrive.status}
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

  if (!electionDefinition) {
    return <UnconfiguredElectionScreen usbDriveStatus={usbDrive.status} />;
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

  if (window.kiosk && usbDrive.status !== 'mounted') {
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
