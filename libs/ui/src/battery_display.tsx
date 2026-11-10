import type { BatteryInfo as BatteryInfoType } from '@votingworks/backend';
import { assert } from '@votingworks/basics';
import { type IconProps, Icons } from './icons.js';

export function getBatteryIcon(
  batteryInfo?: BatteryInfoType,
  inverse = false
): JSX.Element {
  // @coverage-defer
  if (!batteryInfo) {
    return <Icons.BatteryFull color={inverse ? 'inverse' : undefined} />;
  }
  assert(
    batteryInfo.level >= 0 && batteryInfo.level <= 1,
    'Invalid battery level'
  );
  const quarters = Math.round(batteryInfo.level * 4);
  const showDanger = quarters <= 1 && batteryInfo.discharging;
  const iconProps: IconProps = {
    color: inverse ? 'inverse' : showDanger ? 'danger' : undefined,
    style: { fontSize: '1.2em' },
  };

  // @coverage-defer
  switch (quarters) {
    case 0:
      return <Icons.BatteryEmpty {...iconProps} />;
    case 1:
      return <Icons.BatteryQuarter {...iconProps} />;
    case 2:
      return <Icons.BatteryHalf {...iconProps} />;
    case 3:
      return <Icons.BatteryThreeQuarters {...iconProps} />;
    case 4:
      return <Icons.BatteryFull {...iconProps} />;
    default: {
      // @coverage-exclude
      throw new Error('Invalid battery level');
    }
  }
}
