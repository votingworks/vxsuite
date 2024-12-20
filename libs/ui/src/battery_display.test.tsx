import type { BatteryInfo } from '@votingworks/backend';
import { screen } from '../test/react_testing_library';

import { newTestContext } from '../test/test_context';
import { BatteryDisplay } from './battery_display';
import { makeTheme } from './themes/make_theme';

jest.useFakeTimers();

const theme = makeTheme({ colorMode: 'desktop' });

test.each<
  BatteryInfo & {
    expectedBatteryIcon: string;
    expectRedBatteryIcon: boolean;
    expectedPercentText: string;
  }
>([
  {
    level: 0.9,
    discharging: true,
    expectedBatteryIcon: 'battery-full',
    expectRedBatteryIcon: false,
    expectedPercentText: '90%',
  },
  {
    level: 0.7,
    discharging: true,
    expectedBatteryIcon: 'battery-three-quarters',
    expectRedBatteryIcon: false,
    expectedPercentText: '70%',
  },
  {
    level: 0.5,
    discharging: true,
    expectedBatteryIcon: 'battery-half',
    expectRedBatteryIcon: false,
    expectedPercentText: '50%',
  },
  {
    level: 0.3,
    discharging: true,
    expectedBatteryIcon: 'battery-quarter',
    expectRedBatteryIcon: true,
    expectedPercentText: '30%',
  },
  {
    level: 0.1,
    discharging: true,
    expectedBatteryIcon: 'battery-empty',
    expectRedBatteryIcon: true,
    expectedPercentText: '10%',
  },
  {
    level: 0.1,
    discharging: false,
    expectedBatteryIcon: 'battery-empty',
    expectRedBatteryIcon: false,
    expectedPercentText: '10%',
  },
  {
    level: 0.3,
    discharging: false,
    expectedBatteryIcon: 'battery-quarter',
    expectRedBatteryIcon: false,
    expectedPercentText: '30%',
  },
  {
    level: 0.5,
    discharging: false,
    expectedBatteryIcon: 'battery-half',
    expectRedBatteryIcon: false,
    expectedPercentText: '50%',
  },
  {
    level: 0.7,
    discharging: false,
    expectedBatteryIcon: 'battery-three-quarters',
    expectRedBatteryIcon: false,
    expectedPercentText: '70%',
  },
  {
    level: 0.9,
    discharging: false,
    expectedBatteryIcon: 'battery-full',
    expectRedBatteryIcon: false,
    expectedPercentText: '90%',
  },
])(
  'correct battery display for $expectedPercentText, discharging = $discharging',
  async (t) => {
    const { render, mockApiClient } = newTestContext({
      skipUiStringsApi: true,
    });
    mockApiClient.getBatteryInfo.mockResolvedValueOnce(t);
    render(<BatteryDisplay />, { vxTheme: theme });

    await screen.findByText(t.expectedPercentText);
    const icons = screen.getAllByRole('img', { hidden: true });
    const [batteryIcon, boltIcon] = icons;
    expect(batteryIcon).toHaveAttribute('data-icon', t.expectedBatteryIcon);
    if (t.expectRedBatteryIcon) {
      expect(batteryIcon).toHaveStyle(`color: ${theme.colors.dangerAccent};`);
    } else {
      expect(batteryIcon).not.toHaveStyle(
        `color: ${theme.colors.onBackground};`
      );
    }

    if (!t.discharging) {
      expect(boltIcon).toHaveAttribute('data-icon', 'bolt');
    }

    expect(mockApiClient.getBatteryInfo).toHaveBeenCalledTimes(1);
  }
);

test('displays placeholder when battery info is not available', async () => {
  const { render, mockApiClient } = newTestContext({
    skipUiStringsApi: true,
  });
  mockApiClient.getBatteryInfo.mockResolvedValueOnce(null);
  render(<BatteryDisplay />, { vxTheme: theme });

  await screen.findByText('—-%');
  const icon = screen.getByRole('img', { hidden: true });
  expect(icon).toHaveAttribute('data-icon', 'battery-full');

  expect(mockApiClient.getBatteryInfo).toHaveBeenCalledTimes(1);
});
