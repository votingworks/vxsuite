import React, { useCallback } from 'react';
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
import { Hardware, assert } from '@votingworks/utils';
import { LogEventId, Logger } from '@votingworks/logging';

import { UnconfiguredElectionScreen } from './screens/unconfigured_election_screen';
import { LoadingConfigurationScreen } from './screens/loading_configuration_screen';

import { ElectionManagerScreen } from './screens/election_manager_screen';
import { InvalidCardScreen } from './screens/invalid_card_screen';
import { PollsNotOpenScreen } from './screens/polls_not_open_screen';
import { PollWorkerScreen } from './screens/poll_worker_screen';
import { AppContext } from './contexts/app_context';
import { CardErrorScreen } from './screens/card_error_screen';
import { SetupScannerScreen } from './screens/setup_scanner_screen';
import { ScreenMainCenterChild } from './components/layout';
import { InsertUsbScreen } from './screens/insert_usb_screen';
import { ReplaceBallotBagScreen } from './components/replace_ballot_bag_screen';
import {
  BALLOT_BAG_CAPACITY,
  POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
} from './config/globals';
import { UnconfiguredPrecinctScreen } from './screens/unconfigured_precinct_screen';
import { rootDebug } from './utils/debug';
import {
  getConfig,
  getMachineConfig,
  getScannerStatus,
  recordBallotBagReplaced,
  setMarkThresholdOverrides,
  setPollsState,
  setPrecinctSelection,
  unconfigureElection,
} from './api';
import { VoterScreen } from './screens/voter_screen';

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
    scannerStatusQuery.isSuccess &&
    scannerStatusQuery.data.ballotsCounted >=
      configQuery.data.ballotCountWhenBallotBagLastReplaced +
        BALLOT_BAG_CAPACITY;

  if (
    !(
      machineConfigQuery.isSuccess &&
      configQuery.isSuccess &&
      scannerStatusQuery.isSuccess
    )
  ) {
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
  const scannerStatus = scannerStatusQuery.data;

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

  if (scannerStatus.state === 'disconnected') {
    return (
      <SetupScannerScreen
        batteryIsCharging={computer.batteryIsCharging}
        scannedBallotCount={scannerStatus.ballotsCounted}
      />
    );
  }

  if (!electionDefinition) {
    return <UnconfiguredElectionScreen usbDriveStatus={usbDrive.status} />;
  }

  if (auth.status === 'checking_passcode') {
    return <UnlockMachineScreen auth={auth} />;
  }

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
          setMarkThresholdOverrides={updateMarkThresholds}
          unconfigure={unconfigureServer}
          usbDrive={usbDrive}
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
      <VoterScreen
        isTestMode={isTestMode}
        batteryIsCharging={computer.batteryIsCharging}
      />
    </AppContext.Provider>
  );
}
