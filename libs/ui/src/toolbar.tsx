import { useState, useEffect } from 'react';
import type { BatteryInfo } from '@votingworks/backend';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { format } from '@votingworks/utils';
import { styled } from './styled.js';
import { Button } from './button.js';
import { getBatteryIcon } from './battery_display.js';
import { IconName, Icons } from './icons.js';

export const Toolbar = styled.div`
  display: flex;
  flex-direction: row;
  position: sticky;
  top: 0;
  width: 100%;
  height: 2.2rem;
  gap: 1.5rem;
  justify-content: flex-end;
  align-items: center;
  background: ${(p) => p.theme.colors.inverseContainer};
  color: ${(p) => p.theme.colors.onInverse};
  padding: 0.25rem 1rem;
`;

export const ToolbarButtons = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
`;

const Row = styled.div`
  display: flex;
  flex-direction: row;
  gap: 0.25rem;
  align-items: center;
`;

const CompactButton = styled(Button)`
  font-size: 0.8rem;
  padding: 0.25rem 0.75rem;
`;

export function BatteryStatus({
  batteryInfo,
}: {
  batteryInfo: BatteryInfo;
}): JSX.Element {
  return (
    <Row>
      {getBatteryIcon(batteryInfo, true)}
      {!batteryInfo.discharging && (
        <Icons.Bolt style={{ fontSize: '0.8em' }} color="inverse" />
      )}
      {format.percent(batteryInfo.level)}
      {batteryInfo.level < 0.25 && batteryInfo.discharging && (
        <Icons.Warning color="inverseWarning" />
      )}
    </Row>
  );
}

function useCurrentDate(): Date {
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    // @coverage-defer
    const interval = setInterval(() => {
      setCurrentDate(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return currentDate;
}

export function DateTimeDisplay(): JSX.Element {
  const currentDate = useCurrentDate();
  return <span>{format.clockDateAndTime(currentDate)}</span>;
}

type ExtendedUsbDriveStatus = UsbDriveStatus['status'] | 'ejecting';
const USB_BUTTON_ICON_AND_TEXT: Record<
  ExtendedUsbDriveStatus,
  [IconName, string]
> = {
  no_drive: ['Disabled', 'No USB'],
  error: ['Disabled', 'No USB'],
  mounted: ['Eject', 'Eject USB'],
  ejecting: ['Eject', 'Ejecting...'],
  ejected: ['Disabled', 'USB Ejected'],
};

export function UsbEjectButton({
  usbDriveStatus,
  onEject,
  isEjecting,
}: {
  usbDriveStatus: UsbDriveStatus;
  onEject: () => void;
  isEjecting: boolean;
}): JSX.Element {
  const extendedStatus: ExtendedUsbDriveStatus = isEjecting
    ? 'ejecting'
    : usbDriveStatus.status;
  const [icon, text] = USB_BUTTON_ICON_AND_TEXT[extendedStatus];
  return (
    <CompactButton
      icon={icon}
      onPress={onEject}
      color="inverseNeutral"
      disabled={extendedStatus !== 'mounted' || isEjecting}
    >
      {text}
    </CompactButton>
  );
}

export function LockMachineButton({
  onLock,
}: {
  onLock: () => void;
}): JSX.Element {
  return (
    <CompactButton icon="Lock" onPress={onLock} color="inverseNeutral">
      Lock Machine
    </CompactButton>
  );
}
