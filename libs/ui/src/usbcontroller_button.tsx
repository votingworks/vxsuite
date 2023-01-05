import React from 'react';

import { Button } from './button';
import { UsbDriveStatus } from './hooks/use_usb_drive';

/* istanbul ignore next */
function doNothing() {
  // do nothing
}

const disabledText: Record<Exclude<UsbDriveStatus, 'mounted'>, string> = {
  absent: 'No USB',
  bad_format: 'No USB',
  mounting: 'Connecting…',
  ejecting: 'Ejecting…',
  ejected: 'Ejected',
};

interface Props {
  usbDriveStatus: UsbDriveStatus;
  usbDriveEject: () => void;
  primary?: boolean;
  small?: boolean;
}

export function UsbControllerButton({
  usbDriveStatus,
  usbDriveEject,
  primary = false,
  small = true,
}: Props): JSX.Element | null {
  if (usbDriveStatus === 'mounted') {
    return (
      <Button small={small} primary={primary} onPress={usbDriveEject}>
        Eject USB
      </Button>
    );
  }

  return (
    <Button small={small} disabled onPress={doNothing}>
      {disabledText[usbDriveStatus]}
    </Button>
  );
}
