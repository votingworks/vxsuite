import { useState, useEffect } from 'react';
import styled from 'styled-components';
import type { BatteryInfo } from '@votingworks/backend';
import { format } from '@votingworks/utils';
import { Button } from './button';
import { getBatteryIcon } from './battery_display';
import { Icons } from './icons';

export const Toolbar = styled.div`
  display: flex;
  flex-direction: row;
  position: sticky;
  top: 0;
  width: 100%;
  height: 2.2rem;
  gap: 1.25rem;
  justify-content: flex-end;
  align-items: center;
  background: ${(p) => p.theme.colors.inverseContainer};
  color: ${(p) => p.theme.colors.onInverse};
  padding: 0.25rem 1rem;
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
