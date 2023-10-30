import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { Button } from './button';

type ExtendedUsbDriveStatus = UsbDriveStatus['status'] | 'ejecting';

const buttonText: Record<ExtendedUsbDriveStatus, string> = {
  no_drive: 'No USB',
  error: 'No USB',
  mounted: 'Eject USB',
  ejecting: 'Ejecting...',
  ejected: 'Ejected',
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

  return (
    <Button
      variant={primary ? 'primary' : 'neutral'}
      disabled={extendedUsbDriveStatus !== 'mounted'}
      onPress={usbDriveEject}
    >
      {buttonText[extendedUsbDriveStatus]}
    </Button>
  );
}
