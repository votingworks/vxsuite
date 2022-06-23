import React, { useContext } from 'react';
import {
  CurrentDateAndTime,
  Prose,
  RebootFromUsbButton,
  SetClockButton,
} from '@votingworks/ui';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';

export function SettingsScreen(): JSX.Element {
  const { logger, usbDriveStatus } = useContext(AppContext);

  return (
    <NavigationScreen>
      <Prose maxWidth={false}>
        <h1>Settings</h1>
        <h2>Current Date and Time</h2>
        <p>
          <CurrentDateAndTime />
        </p>
        <p>
          <SetClockButton>Update Date and Time</SetClockButton>
        </p>
        <h2>Software Update</h2>
        {/* Intentionally not wrapping this button in a <p> tag because the default <Prose> spacing
          of a <p> following an <h2> looks cramped when the <p> contains a button */}
        <RebootFromUsbButton logger={logger} usbDriveStatus={usbDriveStatus} />
      </Prose>
    </NavigationScreen>
  );
}
