import React from 'react';
import 'normalize.css';

import { Card } from '@votingworks/types';
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
import { Logger } from '@votingworks/logging';

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
import {
  getConfig,
  getMachineConfig,
  getScannerStatus,
  setPollsState,
  unconfigureElection,
} from './api';
import { VoterScreen } from './screens/voter_screen';

export interface Props {
  hardware: Hardware;
  card: Card;
  logger: Logger;
}

export function AppRoot({ hardware, card, logger }: Props): JSX.Element | null {
  const machineConfigQuery = getMachineConfig.useQuery();
  const configQuery = getConfig.useQuery();
  const setPollsStateMutation = setPollsState.useMutation();
  const unconfigureMutation = unconfigureElection.useMutation();

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

  const scannerStatusQuery = getScannerStatus.useQuery({
    refetchInterval: POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  });

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
    ballotCountWhenBallotBagLastReplaced,
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
            unconfigureMutation.mutateAsync({ ignoreBackupRequirement: true })
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
          machineConfig,
          auth,
          logger,
        }}
      >
        <ElectionManagerScreen
          electionDefinition={electionDefinition}
          scannerStatus={scannerStatus}
          isTestMode={isTestMode}
          isSoundMuted={isSoundMuted}
          markThresholdOverrides={markThresholdOverrides}
          pollsState={pollsState}
          usbDrive={usbDrive}
        />
      </AppContext.Provider>
    );
  }

  if (!precinctSelection) return <UnconfiguredPrecinctScreen />;

  if (window.kiosk && usbDrive.status !== 'mounted') {
    return <InsertUsbScreen />;
  }

  const needsToReplaceBallotBag =
    scannerStatus.ballotsCounted >=
    ballotCountWhenBallotBagLastReplaced + BALLOT_BAG_CAPACITY;
  if (needsToReplaceBallotBag && scannerStatus.state !== 'accepted') {
    return (
      <ReplaceBallotBagScreen
        scannedBallotCount={scannerStatus.ballotsCounted}
        pollWorkerAuthenticated={isPollWorkerAuth(auth)}
        logger={logger}
      />
    );
  }

  if (isPollWorkerAuth(auth)) {
    return (
      <AppContext.Provider
        value={{
          precinctSelection,
          machineConfig,
          auth,
          logger,
        }}
      >
        <PollWorkerScreen
          electionDefinition={electionDefinition}
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
          machineConfig,
          auth,
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
        machineConfig,
        auth,
        logger,
      }}
    >
      <VoterScreen
        electionDefinition={electionDefinition}
        isTestMode={isTestMode}
        isSoundMuted={isSoundMuted}
        batteryIsCharging={computer.batteryIsCharging}
      />
    </AppContext.Provider>
  );
}
