import React, { useState } from 'react';
import { format } from '@votingworks/utils';
import { Modal } from './modal';
import { useQueryChangeListener } from './hooks/use_change_listener';
import { useSystemCallApi } from './system_call_api';
import { Button } from './button';
import { H1, P } from './typography';
import { Icons } from './icons';

interface BatteryWarning {
  level: number;
  canDismiss: boolean;
}

const BATTERY_WARNINGS: BatteryWarning[] = [
  { level: 0.15, canDismiss: true },
  { level: 0.1, canDismiss: true },
  { level: 0.05, canDismiss: true },
  { level: 0.01, canDismiss: false },
];

function roundLevel(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * A helper for SessionTimeLimitTracker
 */
export function BatteryLowAlert(): JSX.Element | null {
  const systemCallApi = useSystemCallApi();
  const batteryInfoQuery = systemCallApi.getBatteryInfo.useQuery();
  const batteryInfo = batteryInfoQuery.data;
  const [currentWarning, setCurrentWarning] = useState<BatteryWarning>();

  useQueryChangeListener(batteryInfoQuery, {
    onChange: (newBatteryInfo, previousBatteryInfo) => {
      if (!newBatteryInfo) return;

      // if the battery's charging, dismiss any existing warnings
      if (!newBatteryInfo.discharging) {
        setCurrentWarning(undefined);
        return;
      }

      // if the rounded battery level hasn't changed, don't do anything
      // unless the battery just started discharging
      const newLevel = roundLevel(newBatteryInfo.level);
      if (
        previousBatteryInfo &&
        newLevel === roundLevel(previousBatteryInfo.level) &&
        previousBatteryInfo.discharging
      ) {
        return;
      }

      // if there is an applicable warning, show it
      const applicableWarning = BATTERY_WARNINGS.find(
        (w) => w.level === newLevel
      );
      if (applicableWarning) {
        setCurrentWarning(applicableWarning);
      }
    },
  });

  if (!batteryInfo) {
    return null;
  }

  if (!currentWarning) {
    return null;
  }

  return (
    <Modal
      actions={
        currentWarning.canDismiss ? (
          <Button onPress={() => setCurrentWarning(undefined)}>Dismiss</Button>
        ) : undefined
      }
      content={
        <React.Fragment>
          <H1>
            <Icons.BatteryQuarter color="danger" /> Low Battery Warning
          </H1>
          <P>
            The battery is at {format.percent(batteryInfo.level)} and is not
            charging. Please connect the power supply.
          </P>
        </React.Fragment>
      }
    />
  );
}
