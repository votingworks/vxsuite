import { Redirect, Route, Switch } from 'react-router-dom';

import {
  isElectionManagerAuth,
  isSystemAdministratorAuth,
  isVendorAuth,
} from '@votingworks/utils';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  Main,
  UnlockMachineScreen,
  InvalidCardScreen,
  RemoveCardScreen,
  Screen,
  SetupCardReaderPage,
  H1,
  USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
  VendorScreen,
} from '@votingworks/ui';
import { BaseLogger } from '@votingworks/logging';
import { assert } from '@votingworks/basics';
import { AppContext, AppContextInterface } from './contexts/app_context.js';

import { ScanBallotsScreen } from './screens/scan_ballots_screen.js';
import { BallotEjectScreen } from './screens/ballot_eject_screen.js';
import { SettingsScreen } from './screens/settings_screen.js';

import { MachineLockedScreen } from './screens/machine_locked_screen.js';
import {
  STATUS_POLLING_INTERVAL_MS,
  checkPin,
  getAuthStatus,
  getElectionRecord,
  getMachineConfig,
  getNetworkStatus,
  getPollingPlaceId,
  getStatus,
  getTestMode,
  getUsbDriveStatus,
  logOut,
  networkStatusRefetchInterval,
  unconfigure,
  useApiClient,
} from './api.js';
import { UnconfiguredElectionScreenWrapper } from './screens/unconfigured_election_screen_wrapper.js';
import { SystemAdministratorSettingsScreen } from './screens/system_administrator_settings_screen.js';
import { DiagnosticsScreen } from './screens/diagnostics_screen.js';

export interface AppRootProps {
  logger: BaseLogger;
}

export function AppRoot({ logger }: AppRootProps): JSX.Element | null {
  const apiClient = useApiClient();
  const machineConfigQuery = getMachineConfig.useQuery();
  // AppRoot is the single poller for these queries. Other components
  // subscribe with `useQuery()` and no `refetchInterval`, receiving updates
  // through the shared query cache; react-query runs a separate refetch timer
  // for every observer that sets one, so a second poller would multiply the
  // request rate to the backend.
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery({
    refetchInterval: USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
  });
  const authStatusQuery = getAuthStatus.useQuery({
    refetchInterval: AUTH_STATUS_POLLING_INTERVAL_MS,
  });
  getNetworkStatus.useQuery({
    refetchInterval: networkStatusRefetchInterval,
  });
  const checkPinMutation = checkPin.useMutation();
  const statusQuery = getStatus.useQuery({
    refetchInterval: STATUS_POLLING_INTERVAL_MS,
  });
  const logOutMutation = logOut.useMutation();
  const unconfigureMutation = unconfigure.useMutation();

  const getTestModeQuery = getTestMode.useQuery();
  const isTestMode = getTestModeQuery.data ?? false;

  const electionRecordQuery = getElectionRecord.useQuery();
  const pollingPlaceIdQuery = getPollingPlaceId.useQuery();

  if (
    !machineConfigQuery.isSuccess ||
    !authStatusQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !electionRecordQuery.isSuccess ||
    !getTestModeQuery.isSuccess ||
    !statusQuery.isSuccess ||
    !pollingPlaceIdQuery.isSuccess
  ) {
    return (
      <Screen>
        <Main padded centerChild>
          <H1>Loading Configuration...</H1>
        </Main>
      </Screen>
    );
  }
  const authStatus = authStatusQuery.data;
  const machineConfig = machineConfigQuery.data;
  const usbDriveStatus = usbDriveStatusQuery.data;
  const { electionDefinition, electionPackageHash } =
    electionRecordQuery.data ?? {};
  const status = statusQuery.data;

  const currentContext: AppContextInterface = {
    usbDriveStatus,
    electionDefinition,
    electionPackageHash,
    isTestMode,
    machineConfig,
    logger,
    auth: authStatus,
  };

  if (
    authStatus.status === 'logged_out' &&
    authStatus.reason === 'no_card_reader'
  ) {
    return <SetupCardReaderPage />;
  }

  if (authStatus.status === 'logged_out') {
    if (
      authStatus.reason === 'machine_locked' ||
      authStatus.reason === 'machine_locked_by_session_expiry'
    ) {
      return (
        <AppContext.Provider value={currentContext}>
          <MachineLockedScreen />
        </AppContext.Provider>
      );
    }
    return (
      <InvalidCardScreen
        reasonAndContext={authStatus}
        recommendedAction={
          electionDefinition
            ? 'Use a valid election manager or system administrator card.'
            : 'Use an election manager card.'
        }
        cardInsertionDirection="right"
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

  if (authStatus.status === 'remove_card') {
    return (
      <RemoveCardScreen
        productName="VxCentralScan"
        cardInsertionDirection="right"
      />
    );
  }

  if (isVendorAuth(authStatus)) {
    return (
      <VendorScreen
        apiClient={apiClient}
        isMachineConfigured={Boolean(electionDefinition)}
        logOut={() => logOutMutation.mutate()}
        unconfigureMachine={() =>
          unconfigureMutation.mutateAsync({ ignoreBackupRequirement: true })
        }
      />
    );
  }

  if (isSystemAdministratorAuth(authStatus)) {
    return (
      <AppContext.Provider value={currentContext}>
        <Switch>
          <Route path="/system-administrator-settings">
            <SystemAdministratorSettingsScreen />
          </Route>
          <Route path="/hardware-diagnostics">
            <DiagnosticsScreen />
          </Route>
          <Redirect to="/system-administrator-settings" />
        </Switch>
      </AppContext.Provider>
    );
  }

  if (!electionDefinition) {
    return (
      <AppContext.Provider value={currentContext}>
        <UnconfiguredElectionScreenWrapper
          isElectionManagerAuth={isElectionManagerAuth(authStatus)}
        />
      </AppContext.Provider>
    );
  }

  // A polling place must be selected before scanning.
  const isPollingPlaceUnconfigured = !pollingPlaceIdQuery.data;

  if (status.adjudicationsRemaining > 0) {
    return (
      <AppContext.Provider value={currentContext}>
        <BallotEjectScreen isTestMode={isTestMode} />
      </AppContext.Provider>
    );
  }

  assert(isElectionManagerAuth(authStatus));
  return (
    <AppContext.Provider value={currentContext}>
      <Switch>
        <Route path="/scan">
          <ScanBallotsScreen
            status={status}
            statusIsStale={statusQuery.isStale}
            isPollingPlaceUnconfigured={isPollingPlaceUnconfigured}
          />
        </Route>
        <Route path="/settings">
          <SettingsScreen
            canUnconfigure={status.canUnconfigure}
            hasScannedBatches={status.batches.length > 0}
          />
        </Route>
        <Route path="/hardware-diagnostics">
          <DiagnosticsScreen />
        </Route>
        <Redirect to="/scan" />
      </Switch>
    </AppContext.Provider>
  );
}
