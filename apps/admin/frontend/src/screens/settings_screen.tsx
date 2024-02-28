import React, { useContext } from 'react';
import {
  CurrentDateAndTime,
  ExportLogsButton,
  H2,
  P,
  RebootToBiosButton,
  SetClockButton,
} from '@votingworks/ui';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isSystemAdministratorAuth,
} from '@votingworks/utils';

import { BaseLogger, LogSource } from '@votingworks/logging';
import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';
import { FormatUsbButton } from '../components/format_usb_modal';
import { logOut } from '../api';
import { LiveCheckButton } from '../components/live_check_button';

export interface SettingsScreenProps {
  logger?: BaseLogger;
}

export function SettingsScreen({
  logger = new BaseLogger(LogSource.VxAdminFrontend, window.kiosk),
}: SettingsScreenProps): JSX.Element {
  const { auth, usbDriveStatus } = useContext(AppContext);
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
          <RebootToBiosButton logger={logger} />
        </React.Fragment>
      )}
      {isFeatureFlagEnabled(BooleanEnvironmentVariableName.LIVECHECK) && (
        <React.Fragment>
          <H2>Live Check</H2>
          <P>
            <LiveCheckButton />
          </P>
        </React.Fragment>
      )}
    </NavigationScreen>
  );
}
