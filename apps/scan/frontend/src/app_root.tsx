import { useState } from 'react';

import { SetupCardReaderPage, UnlockMachineScreen } from '@votingworks/ui';
import {
  isSystemAdministratorAuth,
  isElectionManagerAuth,
  isPollWorkerAuth,
} from '@votingworks/utils';
import { BaseLogger } from '@votingworks/logging';

import { assert } from '@votingworks/basics';
import { LoadingConfigurationScreen } from './screens/loading_configuration_screen';
import { ElectionManagerScreen } from './screens/election_manager_screen';
import { InvalidCardScreen } from './screens/invalid_card_screen';
import { PollsNotOpenScreen } from './screens/polls_not_open_screen';
import { PollWorkerScreen } from './screens/poll_worker_screen';
import { CardErrorScreen } from './screens/card_error_screen';
import { SetupScannerScreen } from './screens/setup_scanner_screen';
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
  getPollsInfo,
  getScannerStatus,
  getUsbDriveStatus,
  systemCallApi,
} from './api';
import { VoterScreen } from './screens/voter_screen';
import { LoginPromptScreen } from './screens/login_prompt_screen';
import { CastVoteRecordSyncRequiredScreen } from './screens/cast_vote_record_sync_required_screen';
import { SystemAdministratorScreen } from './screens/system_administrator_screen';

export interface Props {
  logger: BaseLogger;
}

export function AppRoot({ logger }: Props): JSX.Element | null {
  const authStatusQuery = getAuthStatus.useQuery();
  const configQuery = getConfig.useQuery();
  const pollsInfoQuery = getPollsInfo.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const checkPinMutation = checkPin.useMutation();

  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();

  const scannerStatusQuery = getScannerStatus.useQuery({
    refetchInterval: POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  });

  const [
    shouldStayOnCastVoteRecordSyncRequiredScreen,
    setShouldStayOnCastVoteRecordSyncRequiredScreen,
  ] = useState(false);

  if (
    !(
      authStatusQuery.isSuccess &&
      configQuery.isSuccess &&
      scannerStatusQuery.isSuccess &&
      usbDriveStatusQuery.isSuccess &&
      pollsInfoQuery.isSuccess &&
      batteryInfoQuery.isSuccess
    )
  ) {
    return <LoadingConfigurationScreen />;
  }

  const authStatus = authStatusQuery.data;
  const {
    electionDefinition,
    systemSettings,
    isTestMode,
    precinctSelection,
    isSoundMuted,
    ballotCountWhenBallotBagLastReplaced,
  } = configQuery.data;
  const scannerStatus = scannerStatusQuery.data;
  const usbDrive = usbDriveStatusQuery.data;
  const batteryInfo = batteryInfoQuery.data;
  const batteryIsCharging = batteryInfo ? !batteryInfo.discharging : true;
  const pollsInfo = pollsInfoQuery.data;
  const { pollsState } = pollsInfo;

  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'no_card_reader'
  ) {
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
    return <InvalidCardScreen authStatus={authStatus} />;
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
      <SystemAdministratorScreen
        electionDefinition={electionDefinition}
        pollsState={pollsState}
        usbDrive={usbDrive}
      />
    );
  }

  if (scannerStatus.state === 'disconnected') {
    return (
      <SetupScannerScreen
        batteryIsCharging={batteryIsCharging}
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
        scannedBallotCount={scannerStatus.ballotsCounted}
        pollsInfo={pollsInfo}
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
        showNoChargerWarning={!batteryIsCharging}
        scannedBallotCount={scannerStatus.ballotsCounted}
      />
    );
  }

  if (
    usbDrive.doesUsbDriveRequireCastVoteRecordSync ||
    // This ensures that we don't immediately transition away from the CVR sync success message.
    // We can't rely on doesUsbDriveRequireCastVoteRecordSync because it becomes false as soon as
    // the sync completes.
    shouldStayOnCastVoteRecordSyncRequiredScreen
  ) {
    return (
      <CastVoteRecordSyncRequiredScreen
        setShouldStayOnCastVoteRecordSyncRequiredScreen={
          setShouldStayOnCastVoteRecordSyncRequiredScreen
        }
      />
    );
  }

  return (
    <VoterScreen
      electionDefinition={electionDefinition}
      systemSettings={systemSettings}
      isTestMode={isTestMode}
      isSoundMuted={isSoundMuted}
      batteryIsCharging={batteryIsCharging}
    />
  );
}
