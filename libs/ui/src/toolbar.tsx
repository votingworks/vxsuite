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

// Polls every second, but stores the formatted text rather than the Date, so
// that the ~59 out of 60 ticks that don't change the displayed minute are
// dropped by React's state bailout instead of re-rendering the toolbar.
function useCurrentDateTimeText(): string {
  const [currentDateTimeText, setCurrentDateTimeText] = useState(() =>
    format.clockDateAndTime(new Date())
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentDateTimeText(format.clockDateAndTime(new Date()));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return currentDateTimeText;
}

export function DateTimeDisplay(): JSX.Element {
  return <span>{useCurrentDateTimeText()}</span>;
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
