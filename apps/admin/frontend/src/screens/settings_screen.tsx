import React, { useContext } from 'react';
import { assert } from '@votingworks/basics';
import {
  CurrentDateAndTime,
  Prose,
  RebootFromUsbButton,
  RebootToBiosButton,
  SetClockButton,
} from '@votingworks/ui';
import { isSystemAdministratorAuth } from '@votingworks/utils';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';
import { FormatUsbButton } from '../components/format_usb_modal';
import { updateSessionExpiry } from '../api';

export function SettingsScreen(): JSX.Element {
  const { auth, logger, usbDrive } = useContext(AppContext);
  const updateSessionExpiryMutation = updateSessionExpiry.useMutation();

  assert(isSystemAdministratorAuth(auth));

  return (
    <NavigationScreen title="Settings">
      <Prose maxWidth={false}>
        <h2>Current Date and Time</h2>
        <p>
          <SetClockButton
            sessionExpiresAt={auth.sessionExpiresAt}
            updateSessionExpiry={async (sessionExpiresAt: Date) => {
              try {
                await updateSessionExpiryMutation.mutateAsync({
                  sessionExpiresAt,
                });
              } catch {
                // Handled by default query client error handling
              }
            }}
          >
            <CurrentDateAndTime />
          </SetClockButton>
        </p>
        <h2>USB Formatting</h2>
        <FormatUsbButton />
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
