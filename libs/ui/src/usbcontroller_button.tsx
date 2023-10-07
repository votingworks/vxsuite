import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { Button, ButtonVariant } from './button';

/* istanbul ignore next */
function doNothing() {
  // do nothing
}

const disabledText: Record<
  Exclude<UsbDriveStatus['status'], 'mounted'>,
  string
> = {
  no_drive: 'No USB',
  error: 'No USB',
  ejected: 'Ejected',
};

interface Props {
  usbDriveStatus: UsbDriveStatus;
  usbDriveEject: () => void;
  primary?: boolean;
  small?: boolean;
  disabled?: boolean;
}

export function UsbControllerButton({
  usbDriveStatus,
  usbDriveEject,
  primary = false,
  small = true,
  disabled = false,
}: Props): JSX.Element | null {
  const variant: ButtonVariant = primary ? 'primary' : 'regular';

  const { status } = usbDriveStatus;
  if (status === 'mounted') {
    return (
      <Button
        small={small}
        variant={variant}
        onPress={usbDriveEject}
        disabled={disabled}
      >
        Eject USB
      </Button>
    );
  }

  return (
    <Button small={small} disabled onPress={doNothing}>
      {disabledText[status]}
    </Button>
  );
}
