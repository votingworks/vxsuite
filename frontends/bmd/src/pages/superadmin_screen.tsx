import React, { useEffect } from 'react';

import { Main, MainChild, RebootFromUsbButton } from '@votingworks/ui';

import { usbstick } from '@votingworks/utils';
import { Logger } from '@votingworks/logging';
import { Screen } from '../components/screen';

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
      <Main padded>
        <MainChild center>
          <RebootFromUsbButton
            usbDriveStatus={usbDriveStatus}
            logger={logger}
          />
        </MainChild>
      </Main>
    </Screen>
  );
}
