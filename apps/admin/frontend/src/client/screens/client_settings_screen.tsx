import React, { useContext } from 'react';
import {
  Button,
  CurrentDateAndTime,
  ExportLogsButton,
  FormatUsbButton,
  FullScreenMessage,
  H2,
  Icons,
  Main,
  P,
  Screen,
  SetClockButton,
  SignedHashValidationButton,
  ToggleUsbPortsButton,
  useSystemCallApi,
} from '@votingworks/ui';
import { isSystemAdministratorAuth } from '@votingworks/utils';
import { AppContext } from '../../contexts/app_context';
import { NavigationScreen } from '../../components/navigation_screen';
import {
  formatUsbDrive,
  getNetworkConnectionStatus,
  logOut,
  setMachineMode,
  useApiClient,
} from '../api';

function NetworkStatusSection(): JSX.Element {
  const networkStatusQuery = getNetworkConnectionStatus.useQuery();

  return (
    <React.Fragment>
      <H2>Network</H2>
      <P>
        {networkStatusQuery.isSuccess &&
          networkStatusQuery.data.status === 'online-connected-to-host' && (
            <span>
              <Icons.Done color="success" /> Connected to host{' '}
              {networkStatusQuery.data.hostMachineId}
            </span>
          )}
        {networkStatusQuery.isSuccess &&
          networkStatusQuery.data.status === 'online-waiting-for-host' && (
            <span>
              <Icons.Warning color="warning" /> Searching for host…
            </span>
          )}
        {networkStatusQuery.isSuccess &&
          networkStatusQuery.data.status === 'offline' && (
            <span>
              <Icons.Danger color="danger" /> Offline — no network connection
            </span>
          )}
        {!networkStatusQuery.isSuccess && <span>Checking network status…</span>}
      </P>
    </React.Fragment>
  );
}

export function ClientSettingsScreen(): JSX.Element | null {
  const { auth, electionDefinition, usbDriveStatus } = useContext(AppContext);
  const apiClient = useApiClient();
  const logOutMutation = logOut.useMutation();
  const formatUsbDriveMutation = formatUsbDrive.useMutation();
  const setMachineModeMutation = setMachineMode.useMutation();
  const powerDownMutation = useSystemCallApi().powerDown.useMutation();

  if (setMachineModeMutation.isSuccess) {
    return (
      <Screen>
        <Main centerChild>
          <FullScreenMessage title="Machine mode changed, restart the machine to continue.">
            <P>
              <Button
                onPress={
                  /* istanbul ignore next - no-op in tests @preserve */
                  () => powerDownMutation.mutate()
                }
              >
                Power Down
              </Button>
            </P>
          </FullScreenMessage>
        </Main>
      </Screen>
    );
  }

  return (
    <NavigationScreen title="Settings">
      {isSystemAdministratorAuth(auth) && <NetworkStatusSection />}
      <H2>Logs</H2>
      <ExportLogsButton usbDriveStatus={usbDriveStatus} />
      <H2>Date and Time</H2>
      <P>
        <CurrentDateAndTime />
      </P>
      <P>
        <SetClockButton logOut={() => logOutMutation.mutate()}>
          Set Date and Time
        </SetClockButton>
      </P>
      {isSystemAdministratorAuth(auth) && (
        <React.Fragment>
          <H2>USB Formatting</H2>
          <FormatUsbButton
            usbDriveStatus={usbDriveStatus}
            formatUsbDriveMutation={formatUsbDriveMutation}
          />
        </React.Fragment>
      )}
      <H2>Security</H2>
      <P>
        <SignedHashValidationButton apiClient={apiClient} />
      </P>
      {isSystemAdministratorAuth(auth) && (
        <P>
          <ToggleUsbPortsButton />
        </P>
      )}
      {isSystemAdministratorAuth(auth) && !electionDefinition && (
        <React.Fragment>
          <H2>Machine Mode</H2>
          <P>
            <Button
              onPress={() => setMachineModeMutation.mutate({ mode: 'host' })}
              disabled={setMachineModeMutation.isLoading}
            >
              Switch to Host Mode
            </Button>
          </P>
        </React.Fragment>
      )}
    </NavigationScreen>
  );
}
