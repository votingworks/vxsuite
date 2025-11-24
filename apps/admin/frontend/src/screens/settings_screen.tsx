import React, { useContext } from 'react';
import {
  CurrentDateAndTime,
  ExportLogsButton,
  FormatUsbButton,
  H2,
  P,
  SetClockButton,
  SignedHashValidationButton,
  ToggleUsbPortsButton,
} from '@votingworks/ui';
import { isSystemAdministratorAuth } from '@votingworks/utils';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';
import { formatUsbDrive, logOut, useApiClient } from '../api';

export function SettingsScreen(): JSX.Element | null {
  const { auth, usbDriveStatus } = useContext(AppContext);
  const apiClient = useApiClient();
  const logOutMutation = logOut.useMutation();
  const formatUsbDriveMutation = formatUsbDrive.useMutation();

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
    </NavigationScreen>
  );
}
