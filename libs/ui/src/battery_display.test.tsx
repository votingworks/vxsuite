import { expect, test } from 'vitest';
import type { BatteryInfo } from '@votingworks/backend';
import { render, screen } from '../test/react_testing_library.js';
import { getBatteryIcon } from './battery_display.js';
import { makeTheme } from './themes/make_theme.js';

const theme = makeTheme({ colorMode: 'desktop' });

test.each<
  BatteryInfo & {
    expectedBatteryIcon: string;
    expectRedBatteryIcon: boolean;
  }
>([
  {
    level: 0.9,
    discharging: true,
    expectedBatteryIcon: 'battery-full',
    expectRedBatteryIcon: false,
  },
  {
    level: 0.7,
    discharging: true,
    expectedBatteryIcon: 'battery-three-quarters',
    expectRedBatteryIcon: false,
  },
  {
    level: 0.5,
    discharging: true,
    expectedBatteryIcon: 'battery-half',
    expectRedBatteryIcon: false,
  },
  {
    level: 0.3,
    discharging: true,
    expectedBatteryIcon: 'battery-quarter',
    expectRedBatteryIcon: true,
  },
  {
    level: 0.1,
    discharging: true,
    expectedBatteryIcon: 'battery-empty',
    expectRedBatteryIcon: true,
  },
  {
    level: 0.1,
    discharging: false,
    expectedBatteryIcon: 'battery-empty',
    expectRedBatteryIcon: false,
  },
  {
    level: 0.3,
    discharging: false,
    expectedBatteryIcon: 'battery-quarter',
    expectRedBatteryIcon: false,
  },
  {
    level: 0.5,
    discharging: false,
    expectedBatteryIcon: 'battery-half',
    expectRedBatteryIcon: false,
  },
  {
    level: 0.7,
    discharging: false,
    expectedBatteryIcon: 'battery-three-quarters',
    expectRedBatteryIcon: false,
  },
  {
    level: 0.9,
    discharging: false,
    expectedBatteryIcon: 'battery-full',
    expectRedBatteryIcon: false,
  },
])('getBatteryIcon for level $level, discharging = $discharging', (t) => {
  render(getBatteryIcon(t), { vxTheme: theme });

  const batteryIcon = screen.getByRole('img', { hidden: true });
  expect(batteryIcon).toHaveAttribute('data-icon', t.expectedBatteryIcon);
  if (t.expectRedBatteryIcon) {
    expect(batteryIcon).toHaveStyle(`color: ${theme.colors.dangerAccent};`);
  } else {
    expect(batteryIcon).not.toHaveStyle(`color: ${theme.colors.onBackground};`);
  }
});
