import userEvent from '@testing-library/user-event';
import {
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from '../test/react_testing_library';
import { newTestContext } from '../test/test_context';
import { BatteryLowAlert } from './battery_low_alert';
import { BATTERY_POLLING_INTERVAL_GROUT } from '.';

jest.useFakeTimers();

test(`warning when battery drops`, async () => {
  const { render, mockApiClient } = newTestContext({
    skipUiStringsApi: true,
  });

  mockApiClient.getBatteryInfo.mockResolvedValue({
    level: 0.11,
    discharging: true,
  });
  render(<BatteryLowAlert />);

  // no warning initially, since we're above the threshold
  await waitFor(() => {
    // allow component to settle
    expect(mockApiClient.getBatteryInfo).toHaveBeenCalledTimes(2);
  });
  expect(screen.queryByRole('alertdialog')).toBeNull();

  // warning at 10%
  mockApiClient.getBatteryInfo.mockResolvedValue({
    level: 0.1,
    discharging: true,
  });
  const warning = await screen.findByRole('alertdialog');
  within(warning).getByRole('heading', { name: 'Low Battery Warning' });
  within(warning).getByText(
    `The battery is at 10% and is not charging. Please connect the power supply.`
  );
  userEvent.click(within(warning).getButton('Dismiss'));
  expect(screen.queryByRole('alertdialog')).toBeNull();

  // doesn't warn again if we haven't hit the next threshold
  mockApiClient.getBatteryInfo.mockReset();
  mockApiClient.getBatteryInfo.mockResolvedValue({
    level: 0.06,
    discharging: true,
  });
  await waitFor(
    // allow component to settle
    () => {
      expect(mockApiClient.getBatteryInfo).toHaveBeenCalledTimes(2);
    },
    {
      timeout: BATTERY_POLLING_INTERVAL_GROUT * 3,
    }
  );
  expect(screen.queryByRole('alertdialog')).toBeNull();

  // warns again at 5%
  mockApiClient.getBatteryInfo.mockResolvedValue({
    level: 0.05,
    discharging: true,
  });
  const secondWarning = await screen.findByRole('alertdialog');
  within(secondWarning).getByRole('heading', { name: 'Low Battery Warning' });
  within(secondWarning).getByText(
    `The battery is at 5% and is not charging. Please connect the power supply.`
  );
  userEvent.click(within(secondWarning).getButton('Dismiss'));
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

test('connecting power supply dismisses warning, disconnecting brings warning back', async () => {
  const { render, mockApiClient } = newTestContext({
    skipUiStringsApi: true,
  });
  mockApiClient.getBatteryInfo.mockResolvedValue({
    level: 0.08,
    discharging: true,
  });
  render(<BatteryLowAlert />);

  const modal = await screen.findByRole('alertdialog');

  // connect power
  mockApiClient.getBatteryInfo.mockResolvedValue({
    level: 0.08,
    discharging: false,
  });
  await waitForElementToBeRemoved(modal);

  // disconnect power again
  mockApiClient.getBatteryInfo.mockResolvedValue({
    level: 0.08,
    discharging: true,
  });
  await screen.findByRole('alertdialog');
});

test('nothing appears if battery info is null', async () => {
  const { render, mockApiClient } = newTestContext({
    skipUiStringsApi: true,
  });
  mockApiClient.getBatteryInfo.mockResolvedValue(null);
  render(<BatteryLowAlert />);

  await waitFor(() => {
    // allow component to settle to avoid test warning
    expect(mockApiClient.getBatteryInfo).toHaveBeenCalledTimes(2);
  });
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});
