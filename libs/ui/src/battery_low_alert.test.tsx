import userEvent from '@testing-library/user-event';
import { advancePromises } from '@votingworks/test-utils';
import {
  screen,
  waitForElementToBeRemoved,
  within,
} from '../test/react_testing_library';
import { newTestContext } from '../test/test_context';
import { BatteryLowAlert } from './battery_low_alert';

jest.useFakeTimers();

test.each<{
  warningLevel: number;
  warningPercent: string;
  canDismiss: boolean;
}>([
  {
    warningLevel: 0.15,
    warningPercent: '15%',
    canDismiss: true,
  },
  {
    warningLevel: 0.1,
    warningPercent: '10%',
    canDismiss: true,
  },
  {
    warningLevel: 0.05,
    warningPercent: '5%',
    canDismiss: true,
  },
  {
    warningLevel: 0.01,
    warningPercent: '1%',
    canDismiss: false,
  },
])(`warning when battery drops to $warningPercent`, async (t) => {
  const { render, mockApiClient } = newTestContext({
    skipUiStringsApi: true,
  });
  mockApiClient.getBatteryInfo.mockResolvedValue({
    // confirm we're rounding up and not considering this at the warning level
    level: t.warningLevel + 0.007,
    discharging: true,
  });
  render(<BatteryLowAlert />);
  expect(screen.queryByRole('alertdialog')).toBeNull();

  mockApiClient.getBatteryInfo.mockResolvedValue({
    // confirm we're rounding down and considering this at the warning level
    level: t.warningLevel + 0.003,
    discharging: true,
  });
  const warning = await screen.findByRole('alertdialog');
  within(warning).getByRole('heading', { name: 'Low Battery Warning' });
  within(warning).getByText(
    `The battery is at ${t.warningPercent} and is not charging. Please connect the power supply.`
  );

  if (!t.canDismiss) {
    expect(within(warning).queryButton('Dismiss')).toBeNull();
    return;
  }

  userEvent.click(within(warning).getButton('Dismiss'));
  expect(screen.queryByRole('alertdialog')).toBeNull();

  // confirm the modal doesn't reappear if the battery is still at the warning level
  mockApiClient.getBatteryInfo.mockResolvedValue({
    level: t.warningLevel - 0.003,
    discharging: true,
  });
  jest.advanceTimersByTime(5000);
  await advancePromises(); // to make sure a re-render happens (coverage enforces this)
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('connecting power supply dismisses warning', async () => {
  const { render, mockApiClient } = newTestContext({
    skipUiStringsApi: true,
  });
  mockApiClient.getBatteryInfo.mockResolvedValue({
    level: 0.15,
    discharging: true,
  });
  render(<BatteryLowAlert />);

  const warning = await screen.findByRole('alertdialog');
  within(warning).getByRole('heading', { name: 'Low Battery Warning' });
  within(warning).getByText(
    `The battery is at 15% and is not charging. Please connect the power supply.`
  );

  // connect power
  mockApiClient.getBatteryInfo.mockResolvedValue({
    level: 0.15,
    discharging: false,
  });
  await waitForElementToBeRemoved(warning);
});

test('nothing appears if battery info is null', async () => {
  const { render, mockApiClient } = newTestContext({
    skipUiStringsApi: true,
  });
  mockApiClient.getBatteryInfo.mockResolvedValue(null);
  render(<BatteryLowAlert />);

  await advancePromises(); // to make sure a render happens (coverage enforces this)
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

test('unplugging power when at a warning level triggers warning', async () => {
  const { render, mockApiClient } = newTestContext({
    skipUiStringsApi: true,
  });
  mockApiClient.getBatteryInfo.mockResolvedValue({
    level: 0.15,
    discharging: false,
  });
  render(<BatteryLowAlert />);

  await advancePromises();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  mockApiClient.getBatteryInfo.mockResolvedValue({
    level: 0.15,
    discharging: true,
  });
  const warning = await screen.findByRole('alertdialog');
  within(warning).getByRole('heading', { name: 'Low Battery Warning' });
  within(warning).getByText(
    `The battery is at 15% and is not charging. Please connect the power supply.`
  );
});
