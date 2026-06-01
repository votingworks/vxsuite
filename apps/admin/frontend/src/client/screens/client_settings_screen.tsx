import React, { useContext } from 'react';
import {
  Button,
  CurrentDateAndTime,
  ExportLogsButton,
  FormatUsbButton,
  FullScreenIconWrapper,
  FullScreenMessage,
  H2,
  Icons,
  Main,
  MainContent,
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
          networkStatusQuery.data.status ===
            'online-multiple-hosts-detected' && (
            <span>
              <Icons.Danger color="danger" /> Multiple hosts detected on the
              network. Only one host should be active at a time. This
              adjudication station will not connect until the conflict is
              resolved.
            </span>
          )}
        {networkStatusQuery.isSuccess &&
          networkStatusQuery.data.status ===
            'online-incompatible-host-version' && (
            <span>
              <Icons.Danger color="danger" /> VxAdmin with incompatible software
              version detected on the network.
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
  const rebootMutation = useSystemCallApi().reboot.useMutation();

  if (setMachineModeMutation.isSuccess) {
    return (
      <Screen>
        <Main flexColumn>
          <MainContent style={{ display: 'flex', justifyContent: 'center' }}>
            <FullScreenMessage
              title={
                <React.Fragment>
                  VxAdmin switched to host mode.
                  <br />
                  Restart VxAdmin to continue.
                </React.Fragment>
              }
              image={
                <FullScreenIconWrapper>
                  <Icons.Rotate />
                </FullScreenIconWrapper>
              }
            >
              <Button
                variant="primary"
                onPress={
                  /* istanbul ignore next - no-op in tests */
                  () => rebootMutation.mutate()
                }
              >
                Restart
              </Button>
            </FullScreenMessage>
          </MainContent>
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
