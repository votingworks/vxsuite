import React, { useEffect } from 'react';

import {
  Main,
  RebootFromUsbButton,
  RebootToBiosButton,
  Screen,
  Button,
} from '@votingworks/ui';

import { usbstick } from '@votingworks/utils';
import { Logger } from '@votingworks/logging';

interface Props {
  usbDriveStatus: usbstick.UsbDriveStatus;
  useEffectToggleLargeDisplay: () => void;
  logger: Logger;
}

/**
 * Screen when a super admin card is inserted. More functionality will be added to this in the future, for now it just can reboot from usb.
 */
export function SuperAdminScreen({
  usbDriveStatus,
  useEffectToggleLargeDisplay,
  logger,
}: Props): JSX.Element {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(useEffectToggleLargeDisplay, []);
  return (
    <Screen white>
      <Main padded centerChild>
        <RebootFromUsbButton usbDriveStatus={usbDriveStatus} logger={logger} />
        <br />
        <RebootToBiosButton logger={logger} />
        <br />
        <Button onPress={() => window.kiosk?.quit()}>Reset</Button>
      </Main>
    </Screen>
  );
}
