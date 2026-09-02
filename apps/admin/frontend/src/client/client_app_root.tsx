import { useEffect, useRef } from 'react';
import { Redirect, Route, Switch, useHistory } from 'react-router-dom';
import {
  InvalidCardScreen,
  RemoveCardScreen,
  SetupCardReaderPage,
  UnlockMachineScreen,
  VendorScreen,
} from '@votingworks/ui';
import {
  isElectionManagerAuth,
  isPollWorkerAuth,
  isSystemAdministratorAuth,
  isVendorAuth,
} from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import {
  checkPin,
  getAuthStatus,
  getCurrentElectionMetadata,
  getMachineConfig,
  getUsbDriveStatus,
  logOut,
  useApiClient,
} from './api.js';
import { AppContext, AppContextInterface } from '../contexts/app_context.js';
import { routerPaths } from '../router_paths.js';
import { ClientMachineLockedScreen } from './screens/client_machine_locked_screen.js';
import { ClientSettingsScreen } from './screens/client_settings_screen.js';
import { ClientDiagnosticsScreen } from './screens/client_diagnostics_screen.js';
import { ClientAdjudicationScreen } from './screens/client_adjudication_screen.js';
import { ClientBallotAdjudicationScreen } from './screens/client_ballot_adjudication_screen.js';

export function ClientAppRoot(): JSX.Element | null {
  const authStatusQuery = getAuthStatus.usePollingQuery();
  const getMachineConfigQuery = getMachineConfig.useQuery();
  const checkPinMutation = checkPin.useMutation();
  const electionMetadataQuery = getCurrentElectionMetadata.usePollingQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.usePollingQuery();
  const apiClient = useApiClient();
  const logOutMutation = logOut.useMutation();
  const history = useHistory();
  const previousAuthStatusRef = useRef<string | undefined>(undefined);

  // On logout reset the url to the home screen so the session is cleared when logging back in.
  useEffect(() => {
    const currentStatus = authStatusQuery.data?.status;
    const previousStatus = previousAuthStatusRef.current;
    previousAuthStatusRef.current = currentStatus;

    if (!currentStatus || !previousStatus) return;

    if (previousStatus !== 'logged_out' && currentStatus === 'logged_out') {
      history.replace(routerPaths.adjudication);
    }
  }, [authStatusQuery.data?.status, history]);

  if (
    !authStatusQuery.isSuccess ||
    !getMachineConfigQuery.isSuccess ||
    !electionMetadataQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess
  ) {
    return null;
  }

  const auth = authStatusQuery.data;
  const machineConfig = getMachineConfigQuery.data;
  const electionRecord = electionMetadataQuery.data;
  const usbDriveStatus = usbDriveStatusQuery.data;

  const hasCardReaderAttached = !(
    auth.status === 'logged_out' && auth.reason === 'no_card_reader'
  );
  if (!hasCardReaderAttached) {
    return <SetupCardReaderPage />;
  }

  if (auth.status === 'checking_pin') {
    return (
      <UnlockMachineScreen
        auth={auth}
        checkPin={
          // @coverage-exclude: tested via host app
          async (pin) => {
            try {
              await checkPinMutation.mutateAsync({ pin });
            } catch {
              // Handled by default query client error handling
            }
          }
        }
      />
    );
  }

  if (auth.status === 'remove_card') {
    return (
      <RemoveCardScreen productName="VxAdmin" cardInsertionDirection="right" />
    );
  }

  if (auth.status === 'logged_out') {
    if (
      auth.reason === 'machine_locked' ||
      auth.reason === 'machine_locked_by_session_expiry'
    ) {
      return (
        <AppContext.Provider
          value={{
            auth,
            machineConfig,
            electionDefinition: electionRecord?.electionDefinition,
            electionPackageHash: electionRecord?.electionPackageHash,
            isOfficialResults: false,
            usbDriveStatus,
            machineMode: 'client',
          }}
        >
          <ClientMachineLockedScreen />
        </AppContext.Provider>
      );
    }
    return (
      <InvalidCardScreen
        reasonAndContext={auth}
        recommendedAction={
          electionRecord
            ? 'Use an election manager or poll worker card.'
            : 'Use a system administrator card.'
        }
        cardInsertionDirection="right"
      />
    );
  }

  if (isVendorAuth(auth)) {
    return (
      <VendorScreen
        apiClient={apiClient}
        isMachineConfigured={Boolean(electionRecord)}
        logOut={logOutMutation.mutate}
        unconfigureMachine={
          /* @coverage-exclude: no-op on client */ async () => {}
        }
      />
    );
  }

  const appContext: AppContextInterface = {
    auth,
    machineConfig,
    electionDefinition: electionRecord?.electionDefinition,
    electionPackageHash: electionRecord?.electionPackageHash,
    isOfficialResults: electionRecord?.isOfficialResults ?? false,
    usbDriveStatus,
    machineMode: 'client',
  };

  if (isSystemAdministratorAuth(auth)) {
    return (
      <AppContext.Provider value={appContext}>
        <Switch>
          <Route exact path={routerPaths.settings}>
            <ClientSettingsScreen />
          </Route>
          <Route exact path={routerPaths.hardwareDiagnostics}>
            <ClientDiagnosticsScreen />
          </Route>
          <Redirect to={routerPaths.settings} />
        </Switch>
      </AppContext.Provider>
    );
  }

  if (isElectionManagerAuth(auth)) {
    return (
      <AppContext.Provider value={appContext}>
        <Switch>
          <Route exact path={routerPaths.adjudication}>
            <ClientAdjudicationScreen />
          </Route>
          <Route exact path={routerPaths.ballotAdjudication}>
            <ClientBallotAdjudicationScreen />
          </Route>
          <Route exact path={routerPaths.settings}>
            <ClientSettingsScreen />
          </Route>
          <Route exact path={routerPaths.hardwareDiagnostics}>
            <ClientDiagnosticsScreen />
          </Route>
          <Redirect to={routerPaths.adjudication} />
        </Switch>
      </AppContext.Provider>
    );
  }
  assert(isPollWorkerAuth(auth));
  return (
    <AppContext.Provider value={appContext}>
      <Switch>
        <Route exact path={routerPaths.adjudication}>
          <ClientAdjudicationScreen />
        </Route>
        <Route exact path={routerPaths.ballotAdjudication}>
          <ClientBallotAdjudicationScreen />
        </Route>
        <Redirect to={routerPaths.adjudication} />
      </Switch>
    </AppContext.Provider>
  );
}
