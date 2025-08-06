import {
  CurrentDateAndTime,
  ExportLogsButton,
  FormatUsbButton,
  H2,
  MainContent,
  P,
  SetClockButton,
  SignedHashValidationButton,
} from '@votingworks/ui';
import React from 'react';
import { formatUsbDrive, getUsbDriveStatus, logOut, useApiClient } from './api';

interface SettingsScreenProps {
  showFormatUsbButton: boolean;
}

export function SettingsScreen({
  showFormatUsbButton,
}: SettingsScreenProps): JSX.Element | null {
  const apiClient = useApiClient();
  const logOutMutation = logOut.useMutation();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const formatUsbDriveMutation = formatUsbDrive.useMutation();

  if (!usbDriveStatusQuery.isSuccess) {
    return null;
  }

  const usbDriveStatus = usbDriveStatusQuery.data;

  return (
    <MainContent>
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
      {showFormatUsbButton && (
        <React.Fragment>
          <H2>USB</H2>
          <P>
            <FormatUsbButton
              usbDriveStatus={usbDriveStatus}
              formatUsbDriveMutation={formatUsbDriveMutation}
            />
          </P>
        </React.Fragment>
      )}
      <H2>Security</H2>
      <SignedHashValidationButton apiClient={apiClient} />
    </MainContent>
  );
}
