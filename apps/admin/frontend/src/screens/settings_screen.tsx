import React, { useContext } from 'react';
import {
  Button,
  CurrentDateAndTime,
  ExportLogsButton,
  FormatUsbButton,
  FormatUsbButtonProps,
  FullScreenMessage,
  H2,
  Main,
  P,
  Screen,
  SetClockButton,
  SignedHashValidationButton,
  ToggleUsbPortsButton,
  useSystemCallApi,
} from '@votingworks/ui';
import { ok } from '@votingworks/basics';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isSystemAdministratorAuth,
} from '@votingworks/utils';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';
import { formatUsbDrive, logOut, setMachineMode, useApiClient } from '../api';
import { getUsbDriveStatus } from '../utils/get_usb_drive_status';

export function SettingsScreen(): JSX.Element | null {
  const { auth, electionDefinition, usbDrives } = useContext(AppContext);
  const usbDriveStatus = getUsbDriveStatus(usbDrives);
  const apiClient = useApiClient();
  const logOutMutation = logOut.useMutation();
  const formatUsbDriveMutationRaw = formatUsbDrive.useMutation();
  const formatUsbDriveMutation: FormatUsbButtonProps['formatUsbDriveMutation'] =
    {
      mutateAsync: async () => {
        if ('devPath' in usbDriveStatus) {
          return formatUsbDriveMutationRaw.mutateAsync({
            driveDevPath: usbDriveStatus.devPath,
          });
        }
        return ok();
      },
    };
  const setMachineModeMutation = setMachineMode.useMutation();
  const isMultiStationEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
  );
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
      {isSystemAdministratorAuth(auth) &&
        isMultiStationEnabled &&
        !electionDefinition && (
          <React.Fragment>
            <H2>Multi-Station Mode</H2>
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
          </React.Fragment>
        )}
    </NavigationScreen>
  );
}
