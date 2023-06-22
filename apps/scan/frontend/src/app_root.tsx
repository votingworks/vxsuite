import React from 'react';

import {
  SetupCardReaderPage,
  useDevices,
  UnlockMachineScreen,
  SystemAdministratorScreenContents,
} from '@votingworks/ui';
import {
  Hardware,
  isSystemAdministratorAuth,
  isElectionManagerAuth,
  isPollWorkerAuth,
} from '@votingworks/utils';
import { Logger } from '@votingworks/logging';

import { assert } from '@votingworks/basics';
import { LoadingConfigurationScreen } from './screens/loading_configuration_screen';
import { ElectionManagerScreen } from './screens/election_manager_screen';
import { InvalidCardScreen } from './screens/invalid_card_screen';
import { PollsNotOpenScreen } from './screens/polls_not_open_screen';
import { PollWorkerScreen } from './screens/poll_worker_screen';
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
import { UnconfiguredElectionScreenWrapper } from './screens/unconfigured_election_screen_wrapper';
import {
  checkPin,
  getAuthStatus,
  getConfig,
  getMachineConfig,
  getScannerStatus,
  getUsbDriveStatus,
  legacyUsbDriveStatus,
  setPollsState,
  unconfigureElection,
} from './api';
import { VoterScreen } from './screens/voter_screen';
import { LoginPromptScreen } from './screens/login_prompt_screen';

export interface Props {
  hardware: Hardware;
  logger: Logger;
}

export function AppRoot({ hardware, logger }: Props): JSX.Element | null {
  const machineConfigQuery = getMachineConfig.useQuery();
  const authStatusQuery = getAuthStatus.useQuery();
  const configQuery = getConfig.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const checkPinMutation = checkPin.useMutation();
  const setPollsStateMutation = setPollsState.useMutation();
  const unconfigureMutation = unconfigureElection.useMutation();

  const {
    cardReader,
    computer,
    printer: printerInfo,
  } = useDevices({
    hardware,
    logger,
  });

  const scannerStatusQuery = getScannerStatus.useQuery({
    refetchInterval: POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  });

  if (
    !(
      machineConfigQuery.isSuccess &&
      authStatusQuery.isSuccess &&
      configQuery.isSuccess &&
      scannerStatusQuery.isSuccess &&
      usbDriveStatusQuery.isSuccess
    )
  ) {
    return <LoadingConfigurationScreen />;
  }

  const machineConfig = machineConfigQuery.data;
  const authStatus = authStatusQuery.data;
  const {
    electionDefinition,
    isTestMode,
    precinctSelection,
    pollsState,
    isSoundMuted,
    ballotCountWhenBallotBagLastReplaced,
  } = configQuery.data;
  const scannerStatus = scannerStatusQuery.data;
  const usbDrive = usbDriveStatusQuery.data;

  if (!cardReader) {
    return <SetupCardReaderPage />;
  }

  // Unconfigured machine, user has not yet attempted auth
  if (
    !electionDefinition &&
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'no_card'
  ) {
    return <LoginPromptScreen />;
  }

  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'card_error'
  ) {
    return <CardErrorScreen />;
  }

  if (authStatus.status === 'logged_out' && authStatus.reason !== 'no_card') {
    return <InvalidCardScreen />;
  }

  if (
    authStatus.status === 'checking_pin' &&
    authStatus.user.role === 'system_administrator'
  ) {
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
      <ScreenMainCenterChild>
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
          usbDriveStatus={legacyUsbDriveStatus(usbDrive)}
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

  if (!electionDefinition) {
    return (
      <UnconfiguredElectionScreenWrapper
        isElectionManagerAuth={isElectionManagerAuth(authStatus)}
      />
    );
  }

  if (isElectionManagerAuth(authStatus)) {
    return (
      <ElectionManagerScreen
        electionDefinition={electionDefinition}
        scannerStatus={scannerStatus}
        usbDrive={usbDrive}
        logger={logger}
      />
    );
  }

  if (!precinctSelection) return <UnconfiguredPrecinctScreen />;

  if (usbDrive.status !== 'mounted') {
    return <InsertUsbScreen />;
  }

  const needsToReplaceBallotBag =
    scannerStatus.ballotsCounted >=
    ballotCountWhenBallotBagLastReplaced + BALLOT_BAG_CAPACITY;
  if (needsToReplaceBallotBag && scannerStatus.state !== 'accepted') {
    return (
      <ReplaceBallotBagScreen
        scannedBallotCount={scannerStatus.ballotsCounted}
        pollWorkerAuthenticated={isPollWorkerAuth(authStatus)}
        logger={logger}
      />
    );
  }

  if (isPollWorkerAuth(authStatus)) {
    return (
      <PollWorkerScreen
        machineConfig={machineConfig}
        electionDefinition={electionDefinition}
        precinctSelection={precinctSelection}
        scannedBallotCount={scannerStatus.ballotsCounted}
        pollsState={pollsState}
        printerInfo={printerInfo}
        isLiveMode={!isTestMode}
        logger={logger}
      />
    );
  }

  // When no card is inserted, we're in "voter" mode
  assert(authStatus.status === 'logged_out' && authStatus.reason === 'no_card');

  if (pollsState !== 'polls_open') {
    return (
      <PollsNotOpenScreen
        isLiveMode={!isTestMode}
        pollsState={pollsState}
        showNoChargerWarning={!computer.batteryIsCharging}
        scannedBallotCount={scannerStatus.ballotsCounted}
      />
    );
  }

  return (
    <VoterScreen
      electionDefinition={electionDefinition}
      isTestMode={isTestMode}
      isSoundMuted={isSoundMuted}
      batteryIsCharging={computer.batteryIsCharging}
    />
  );
}
