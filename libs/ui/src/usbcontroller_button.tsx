import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { Button } from './button';
import { IconName } from './icons';

type ExtendedUsbDriveStatus = UsbDriveStatus['status'] | 'ejecting';

const buttonIconAndText: Record<ExtendedUsbDriveStatus, [IconName, string]> = {
  no_drive: ['Disabled', 'No USB'],
  error: ['Disabled', 'No USB'],
  mounted: ['Eject', 'Eject USB'],
  ejecting: ['Eject', 'Ejecting...'],
  ejected: ['Disabled', 'USB Ejected'],
};

interface Props {
  usbDriveStatus: UsbDriveStatus;
  usbDriveEject: () => void;
  usbDriveIsEjecting: boolean;
  primary?: boolean;
}

export function UsbControllerButton({
  usbDriveStatus,
  usbDriveEject,
  usbDriveIsEjecting,
  primary = false,
}: Props): JSX.Element | null {
  const extendedUsbDriveStatus: ExtendedUsbDriveStatus = usbDriveIsEjecting
    ? 'ejecting'
    : usbDriveStatus.status;

  const [icon, text] = buttonIconAndText[extendedUsbDriveStatus];

  return (
    <Button
      icon={icon}
      variant={primary ? 'primary' : 'neutral'}
      disabled={extendedUsbDriveStatus !== 'mounted'}
      onPress={usbDriveEject}
    >
      {text}
    </Button>
  );
}
