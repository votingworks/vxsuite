import React, { useContext, useState } from 'react';
import {
  Button,
  CurrentDateAndTime,
  ExportLogsButton,
  FormatUsbButton,
  FullScreenMessage,
  H2,
  Icons,
  Main,
  Modal,
  P,
  Screen,
  SetClockButton,
  SignedHashValidationButton,
  Table,
  ToggleUsbPortsButton,
  useSystemCallApi,
} from '@votingworks/ui';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isSystemAdministratorAuth,
} from '@votingworks/utils';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';
import {
  formatUsbDrive,
  getConnectedClients,
  getHostNetworkStatus,
  logOut,
  setMachineMode,
  useApiClient,
} from '../api';

export function SettingsScreen(): JSX.Element | null {
  const { auth, electionDefinition, usbDriveStatus } = useContext(AppContext);
  const apiClient = useApiClient();
  const logOutMutation = logOut.useMutation();
  const formatUsbDriveMutation = formatUsbDrive.useMutation();
  const setMachineModeMutation = setMachineMode.useMutation();
  const isMultiStationEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
  );
  const powerDownMutation = useSystemCallApi().powerDown.useMutation();
  const [isConnectedClientsModalOpen, setIsConnectedClientsModalOpen] =
    useState(false);
  const connectedClientsQuery = getConnectedClients.useQuery({
    enabled: isMultiStationEnabled,
  });
  const hostNetworkStatusQuery = getHostNetworkStatus.useQuery({
    enabled: isMultiStationEnabled,
  });

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
      {isSystemAdministratorAuth(auth) && isMultiStationEnabled && (
        <React.Fragment>
          <H2>Multi-Station Mode</H2>
          {hostNetworkStatusQuery.isSuccess && (
            <P>
              {hostNetworkStatusQuery.data === 'online' ? (
                <React.Fragment>
                  <Icons.Done color="success" /> Network: Online
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <Icons.Danger color="danger" /> Network: Offline
                </React.Fragment>
              )}
            </P>
          )}
          {connectedClientsQuery.isSuccess && (
            <React.Fragment>
              <P>
                <Button onPress={() => setIsConnectedClientsModalOpen(true)}>
                  View Connected Clients ({connectedClientsQuery.data.length})
                </Button>
              </P>
              {isConnectedClientsModalOpen && (
                <Modal
                  title="Connected Clients"
                  content={
                    connectedClientsQuery.data.length === 0 ? (
                      <P>No clients are currently connected.</P>
                    ) : (
                      <Table>
                        <thead>
                          <tr>
                            <th>Machine ID</th>
                          </tr>
                        </thead>
                        <tbody>
                          {connectedClientsQuery.data.map((client) => (
                            <tr key={client.machineId}>
                              <td>{client.machineId}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    )
                  }
                  actions={
                    <Button
                      onPress={() => setIsConnectedClientsModalOpen(false)}
                    >
                      Close
                    </Button>
                  }
                />
              )}
            </React.Fragment>
          )}
          {!electionDefinition && (
            <P>
              <Button
                onPress={() =>
                  setMachineModeMutation.mutate({ mode: 'client' })
                }
                disabled={setMachineModeMutation.isLoading}
              >
                Switch to Client Mode
              </Button>
            </P>
          )}
        </React.Fragment>
      )}
    </NavigationScreen>
  );
}
