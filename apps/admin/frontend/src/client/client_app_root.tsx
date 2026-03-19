import { Redirect, Route, Switch } from 'react-router-dom';
import {
  InvalidCardScreen,
  RemoveCardScreen,
  SetupCardReaderPage,
  UnlockMachineScreen,
} from '@votingworks/ui';
import {
  isElectionManagerAuth,
  isSystemAdministratorAuth,
  isPollWorkerAuth,
} from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import {
  checkPin,
  getAuthStatus,
  getCurrentElectionMetadata,
  getMachineConfig,
  getUsbDriveStatus,
} from './api';
import { AppContext, AppContextInterface } from '../contexts/app_context';
import { MachineLockedScreen } from '../screens/machine_locked_screen';
import { routerPaths } from '../router_paths';
import { ClientSettingsScreen } from './screens/client_settings_screen';
import { ClientDiagnosticsScreen } from './screens/client_diagnostics_screen';
import { ClientAdjudicationScreen } from './screens/client_adjudication_screen';

export function ClientAppRoot(): JSX.Element | null {
  const authStatusQuery = getAuthStatus.useQuery();
  const getMachineConfigQuery = getMachineConfig.useQuery();
  const checkPinMutation = checkPin.useMutation();
  const electionMetadataQuery = getCurrentElectionMetadata.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();

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
          /* istanbul ignore next - tested via host app @preserve */
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
          }}
        >
          <MachineLockedScreen />
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

  const appContext: AppContextInterface = {
    auth,
    machineConfig,
    electionDefinition: electionRecord?.electionDefinition,
    electionPackageHash: electionRecord?.electionPackageHash,
    isOfficialResults: electionRecord?.isOfficialResults ?? false,
    usbDriveStatus,
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
        <Redirect to={routerPaths.adjudication} />
      </Switch>
    </AppContext.Provider>
  );
}
