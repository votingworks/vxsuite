import { useContext } from 'react';
import {
  CurrentDateAndTime,
  H2,
  P,
  RebootFromUsbButton,
  RebootToBiosButton,
  SetClockButton,
} from '@votingworks/ui';

import { AppContext } from '../contexts/app_context';
import { NavigationScreen } from '../components/navigation_screen';
import { FormatUsbButton } from '../components/format_usb_modal';
import { logOut } from '../api';

export function SettingsScreen(): JSX.Element {
  const { logger, usbDrive } = useContext(AppContext);
  const logOutMutation = logOut.useMutation();

  return (
    <NavigationScreen title="Settings">
      <H2>Current Date and Time</H2>
      <P>
        <SetClockButton logOut={() => logOutMutation.mutate()}>
          <CurrentDateAndTime />
        </SetClockButton>
      </P>
      <H2>USB Formatting</H2>
      <FormatUsbButton />
      <H2>Software Update</H2>
      <P>
        <RebootFromUsbButton logger={logger} usbDriveStatus={usbDrive.status} />{' '}
        or <RebootToBiosButton logger={logger} />
      </P>
    </NavigationScreen>
  );
}
