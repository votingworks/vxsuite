import React, { useContext } from 'react';
import {
  CurrentDateAndTime,
  Prose,
  RebootFromUsbButton,
  RebootToBiosButton,
  SetClockButton,
} from '@votingworks/ui';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';

export function SettingsScreen(): JSX.Element {
  const { logger, usbDrive } = useContext(AppContext);

  return (
    <NavigationScreen>
      <Prose maxWidth={false}>
        <h1>Settings</h1>
        <h2>Current Date and Time</h2>
        <p>
          <SetClockButton>
            <CurrentDateAndTime />
          </SetClockButton>
        </p>
        <h2>Software Update</h2>
        <p>
          <RebootFromUsbButton
            logger={logger}
            usbDriveStatus={usbDrive.status}
          />{' '}
          or <RebootToBiosButton logger={logger} />
        </p>
      </Prose>
    </NavigationScreen>
  );
}
