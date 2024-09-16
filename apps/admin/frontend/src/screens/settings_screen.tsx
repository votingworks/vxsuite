import React, { useContext } from 'react';
import {
  CurrentDateAndTime,
  ExportLogsButton,
  H2,
  P,
  RebootToBiosButton,
  SetClockButton,
  SignedHashValidationButton,
} from '@votingworks/ui';
import { isSystemAdministratorAuth } from '@votingworks/utils';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';
import { FormatUsbButton } from '../components/format_usb_modal';
import { logOut, useApiClient } from '../api';

export function SettingsScreen(): JSX.Element {
  const { auth, usbDriveStatus } = useContext(AppContext);
  const apiClient = useApiClient();
  const logOutMutation = logOut.useMutation();

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
          <FormatUsbButton />
          <H2>Software Update</H2>
          <RebootToBiosButton />
        </React.Fragment>
      )}
      <H2>Security</H2>
      <P>
        <SignedHashValidationButton apiClient={apiClient} />
      </P>
    </NavigationScreen>
  );
}
