import React, { useState } from 'react';

import {
  SetupCardReaderPage,
  useDevices,
  UnlockMachineScreen,
  SystemAdministratorScreenContents,
  ExportLogsButtonGroup,
  useQueryChangeListener,
} from '@votingworks/ui';
import {
  Hardware,
  isSystemAdministratorAuth,
  isElectionManagerAuth,
  isPollWorkerAuth,
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
} from '@votingworks/utils';
import { Logger } from '@votingworks/logging';

import { assert, err } from '@votingworks/basics';
import type { LogsResultType } from '@votingworks/backend';
import { PrecinctReportDestination } from '@votingworks/types';
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
  getPollsInfo,
  getScannerStatus,
  getUsbDriveStatus,
  transitionPolls,
  unconfigureElection,
  exportLogsToUsb,
} from './api';
import { VoterScreen } from './screens/voter_screen';
import { LoginPromptScreen } from './screens/login_prompt_screen';
import { LiveCheckButton } from './components/live_check_button';
import { CastVoteRecordSyncRequiredScreen } from './screens/cast_vote_record_sync_required_screen';

export interface Props {
  hardware: Hardware;
  logger: Logger;
  precinctReportDestination: PrecinctReportDestination;
}

export function AppRoot({
  hardware,
  logger,
  precinctReportDestination,
}: Props): JSX.Element | null {
  const machineConfigQuery = getMachineConfig.useQuery();
  const authStatusQuery = getAuthStatus.useQuery();
  const configQuery = getConfig.useQuery();
  const pollsInfoQuery = getPollsInfo.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const checkPinMutation = checkPin.useMutation();
  const transitionPollsMutation = transitionPolls.useMutation();
  const unconfigureMutation = unconfigureElection.useMutation();
  const exportLogsToUsbMutation = exportLogsToUsb.useMutation();

  async function doExportLogs(): Promise<LogsResultType> {
    try {
      return await exportLogsToUsbMutation.mutateAsync();
    } catch (e) {
      return err('copy-failed');
    }
  }

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

  const [
    isCastVoteRecordSyncRequiredScreenUp,
    setIsCastVoteRecordSyncRequiredScreenUp,
  ] = useState(false);
  useQueryChangeListener(usbDriveStatusQuery, {
    onChange: (newUsbDriveStatus) => {
      if (newUsbDriveStatus.doesUsbDriveRequireCastVoteRecordSync) {
        setIsCastVoteRecordSyncRequiredScreenUp(true);
      }
    },
  });

  if (
    !(
      machineConfigQuery.isSuccess &&
      authStatusQuery.isSuccess &&
      configQuery.isSuccess &&
      scannerStatusQuery.isSuccess &&
      usbDriveStatusQuery.isSuccess &&
      pollsInfoQuery.isSuccess
    )
  ) {
    return <LoadingConfigurationScreen />;
  }

  const machineConfig = machineConfigQuery.data;
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
  const pollsInfo = pollsInfoQuery.data;
  const { pollsState } = pollsInfo;

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
    const additionalButtons = (
      <React.Fragment>
        {isFeatureFlagEnabled(BooleanEnvironmentVariableName.LIVECHECK) ? (
          <LiveCheckButton />
        ) : undefined}
        <ExportLogsButtonGroup
          usbDriveStatus={usbDrive}
          auth={authStatus}
          logger={logger}
          onExportLogs={doExportLogs}
        />
      </React.Fragment>
    );
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
          unconfigureMachine={() => unconfigureMutation.mutateAsync()}
          resetPollsToPausedText="The polls are closed and voting is complete. After resetting the polls to paused, it will be possible to re-open the polls and resume voting. All current cast vote records will be preserved."
          resetPollsToPaused={
            pollsState === 'polls_closed_final'
              ? () =>
                  transitionPollsMutation.mutateAsync({
                    type: 'pause_voting',
                    time: Date.now(),
                  })
              : undefined
          }
          isMachineConfigured={Boolean(electionDefinition)}
          usbDriveStatus={usbDrive}
          additionalButtons={additionalButtons}
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
        doExportLogs={doExportLogs}
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
        pollsInfo={pollsInfo}
        printerInfo={printerInfo}
        isLiveMode={!isTestMode}
        logger={logger}
        precinctReportDestination={precinctReportDestination}
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

  if (isCastVoteRecordSyncRequiredScreenUp) {
    return (
      <CastVoteRecordSyncRequiredScreen
        returnToVoterScreen={() =>
          setIsCastVoteRecordSyncRequiredScreenUp(false)
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
      batteryIsCharging={computer.batteryIsCharging}
    />
  );
}
