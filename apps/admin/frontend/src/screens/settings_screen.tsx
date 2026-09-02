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
import { AppContext } from '../contexts/app_context.js';
import { NavigationScreen } from '../components/navigation_screen.js';
import {
  formatUsbDrive,
  logOut,
  setMachineMode,
  useApiClient,
} from '../api.js';
import { isMultiStationAdjudicationEnabled } from '../shared_api.js';

export function SettingsScreen(): JSX.Element | null {
  const { auth, electionDefinition, usbDriveStatus } = useContext(AppContext);
  const apiClient = useApiClient();
  const logOutMutation = logOut.useMutation();
  const formatUsbDriveMutation = formatUsbDrive.useMutation();
  const setMachineModeMutation = setMachineMode.useMutation();
  const isMultiStationEnabled =
    isMultiStationAdjudicationEnabled.useQuery().data ?? false;
  const rebootMutation = useSystemCallApi().reboot.useMutation();

  if (setMachineModeMutation.isSuccess) {
    return (
      <Screen>
        <Main flexColumn>
          <MainContent style={{ display: 'flex', justifyContent: 'center' }}>
            <FullScreenMessage
              title={
                <React.Fragment>
                  VxAdmin switched to adjudication station mode.
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
                  // @coverage-exclude: n-op in tests
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
      {isSystemAdministratorAuth(auth) &&
        isMultiStationEnabled &&
        !electionDefinition && (
          <React.Fragment>
            <H2>Machine Mode</H2>
            <P>
              <Button
                onPress={() =>
                  setMachineModeMutation.mutate({ mode: 'client' })
                }
                disabled={setMachineModeMutation.isLoading}
              >
                Switch to Adjudication Station Mode
              </Button>
            </P>
          </React.Fragment>
        )}
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
    </NavigationScreen>
  );
}
