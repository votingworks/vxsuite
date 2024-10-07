import {
  SetupCardReaderPage,
  UnlockMachineScreen,
  useQueryChangeListener,
  VendorScreen,
} from '@votingworks/ui';
import {
  isSystemAdministratorAuth,
  isElectionManagerAuth,
  isPollWorkerAuth,
  isVendorAuth,
} from '@votingworks/utils';

import { assert } from '@votingworks/basics';
import { useState } from 'react';
import { LoadingConfigurationScreen } from './screens/loading_configuration_screen';
import { ElectionManagerScreen } from './screens/election_manager_screen';
import { InvalidCardScreen } from './screens/invalid_card_screen';
import { PollsNotOpenScreen } from './screens/polls_not_open_screen';
import { PollWorkerScreen } from './screens/poll_worker_screen';
import { CardErrorScreen } from './screens/card_error_screen';
import { InternalConnectionProblemScreen } from './screens/internal_connection_problem_screen';
import { InsertUsbScreen } from './screens/insert_usb_screen';
import { POLLING_INTERVAL_FOR_SCANNER_STATUS_MS } from './config/globals';
import { UnconfiguredPrecinctScreen } from './screens/unconfigured_precinct_screen';
import { UnconfiguredElectionScreenWrapper } from './screens/unconfigured_election_screen_wrapper';
import {
  checkPin,
  getAuthStatus,
  getConfig,
  getPollsInfo,
  getPrinterStatus,
  getScannerStatus,
  getUsbDriveStatus,
  useApiClient,
} from './api';
import { VoterScreen } from './screens/voter_screen';
import { LoginPromptScreen } from './screens/login_prompt_screen';
import { CastVoteRecordSyncRequiredScreen } from './screens/cast_vote_record_sync_required_screen';
import { SystemAdministratorScreen } from './screens/system_administrator_screen';
import { ScannerCoverOpenScreen } from './screens/scanner_cover_open_screen';
import { PrinterCoverOpenScreen } from './screens/printer_cover_open_screen';
import { ScannerDoubleFeedCalibrationScreen } from './screens/scanner_double_feed_calibration_screen';
import { useVoterSettingsControls } from './utils/use_voter_settings_controls';

export function AppRoot(): JSX.Element | null {
  const [
    shouldStayOnCastVoteRecordSyncRequiredScreen,
    setShouldStayOnCastVoteRecordSyncRequiredScreen,
  ] = useState(false);

  const apiClient = useApiClient();
  const authStatusQuery = getAuthStatus.useQuery();
  const configQuery = getConfig.useQuery();
  const pollsInfoQuery = getPollsInfo.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const checkPinMutation = checkPin.useMutation();

  const scannerStatusQuery = getScannerStatus.useQuery({
    refetchInterval: POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  });
  const printerStatusQuery = getPrinterStatus.useQuery();

  const voterSettingsControls = useVoterSettingsControls();
  useQueryChangeListener(scannerStatusQuery, {
    select: ({ state }) => state,
    onChange: (newState, previousState) => {
      // Save voter settings and reset to default theme when election official logs in
      if (newState === 'paused') {
        voterSettingsControls.cacheAndResetVoterSettings();
      }
      // Reset to previous voter settings when election official logs out
      else if (previousState === 'paused' && newState === 'no_paper') {
        voterSettingsControls.restoreVoterSessionsSettings();
      }
      // Reset to default settings when a voter finishes
      else if (previousState !== 'no_paper') {
        voterSettingsControls.resetVoterSettings();
      }
    },
  });

  if (
    !(
      authStatusQuery.isSuccess &&
      configQuery.isSuccess &&
      scannerStatusQuery.isSuccess &&
      usbDriveStatusQuery.isSuccess &&
      pollsInfoQuery.isSuccess &&
      printerStatusQuery.isSuccess
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
    isContinuousExportEnabled,
  } = configQuery.data;
  const scannerStatus = scannerStatusQuery.data;
  const usbDrive = usbDriveStatusQuery.data;
  const pollsInfo = pollsInfoQuery.data;
  const printerStatus = printerStatusQuery.data;
  const { pollsState } = pollsInfo;

  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'no_card_reader'
  ) {
    return <SetupCardReaderPage />;
  }

  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'card_error'
  ) {
    return <CardErrorScreen />;
  }

  if (
    authStatus.status === 'logged_out' &&
    !['no_card', 'session_expired'].includes(authStatus.reason)
  ) {
    return <InvalidCardScreen authStatus={authStatus} />;
  }

  if (
    authStatus.status === 'checking_pin' &&
    ['vendor', 'system_administrator'].includes(authStatus.user.role)
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

  if (isVendorAuth(authStatus)) {
    return (
      <VendorScreen rebootToVendorMenu={() => apiClient.rebootToVendorMenu()} />
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

  if (
    scannerStatus.state === 'calibrating_double_feed_detection.double_sheet' ||
    scannerStatus.state === 'calibrating_double_feed_detection.single_sheet' ||
    scannerStatus.state === 'calibrating_double_feed_detection.done'
  ) {
    return <ScannerDoubleFeedCalibrationScreen />;
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

  if (
    usbDrive.doesUsbDriveRequireCastVoteRecordSync ||
    shouldStayOnCastVoteRecordSyncRequiredScreen
  ) {
    return (
      <CastVoteRecordSyncRequiredScreen
        isAuthenticated={
          isPollWorkerAuth(authStatus) || isElectionManagerAuth(authStatus)
        }
        setShouldStayOnCastVoteRecordSyncRequiredScreen={
          setShouldStayOnCastVoteRecordSyncRequiredScreen
        }
      />
    );
  }

  if (isElectionManagerAuth(authStatus) && electionDefinition) {
    return (
      <ElectionManagerScreen
        electionDefinition={electionDefinition}
        scannerStatus={scannerStatus}
        usbDrive={usbDrive}
      />
    );
  }

  const isInternalConnectionProblem =
    scannerStatus.state === 'disconnected' ||
    (printerStatus.scheme === 'hardware-v4' && printerStatus.state === 'error');
  if (isInternalConnectionProblem) {
    return (
      <InternalConnectionProblemScreen
        scannedBallotCount={scannerStatus.ballotsCounted}
        isScannerConnected={scannerStatus.state !== 'disconnected'}
        printerStatus={printerStatus}
        isPollWorkerAuth={isPollWorkerAuth(authStatus)}
      />
    );
  }

  // Unconfigured machine, user has not yet attempted auth
  if (
    !electionDefinition &&
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'no_card'
  ) {
    return <LoginPromptScreen />;
  }

  if (!electionDefinition) {
    return (
      <UnconfiguredElectionScreenWrapper
        isElectionManagerAuth={isElectionManagerAuth(authStatus)}
      />
    );
  }

  if (!precinctSelection) return <UnconfiguredPrecinctScreen />;

  if (isPollWorkerAuth(authStatus)) {
    return (
      <PollWorkerScreen
        electionDefinition={electionDefinition}
        scannedBallotCount={scannerStatus.ballotsCounted}
      />
    );
  }

  if (
    isContinuousExportEnabled &&
    usbDrive.status !== 'mounted' &&
    pollsState !== 'polls_closed_final'
  ) {
    return <InsertUsbScreen />;
  }

  // When no card is inserted, we're in "voter" mode
  assert(
    authStatus.status === 'logged_out' &&
      ['no_card', 'session_expired'].includes(authStatus.reason)
  );

  if (pollsState !== 'polls_open') {
    return (
      <PollsNotOpenScreen
        isLiveMode={!isTestMode}
        pollsState={pollsState}
        scannedBallotCount={scannerStatus.ballotsCounted}
      />
    );
  }

  if (scannerStatus.state === 'cover_open') {
    return <ScannerCoverOpenScreen />;
  }

  if (
    printerStatus.scheme === 'hardware-v4' &&
    printerStatus.state === 'cover-open'
  ) {
    return <PrinterCoverOpenScreen />;
  }

  return (
    <VoterScreen
      electionDefinition={electionDefinition}
      systemSettings={systemSettings}
      isTestMode={isTestMode}
      isSoundMuted={isSoundMuted}
    />
  );
}
