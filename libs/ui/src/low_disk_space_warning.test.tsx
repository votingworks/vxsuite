import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { DiskSpaceSummary } from '@votingworks/utils';

import { screen, within } from '../test/react_testing_library';
import { newTestContext } from '../test/test_context';
import { LowDiskSpaceWarning } from './low_disk_space_warning';
import { DISK_SPACE_POLLING_INTERVAL_MS } from './system_call_api';

vi.useFakeTimers({ shouldAdvanceTime: true });

const diskSpaceSummaryLowAvailable: DiskSpaceSummary = {
  total: 10_000_000,
  used: 9_900_000,
  available: 100_000,
};

const diskSpaceSummaryPlentyAvailable: DiskSpaceSummary = {
  total: 10_000_000,
  used: 1_000_000,
  available: 9_000_000,
};

test('Low disk space warning', async () => {
  const { mockApiClient, render } = newTestContext({
    skipUiStringsApi: true,
  });

  mockApiClient.getDiskSpaceSummary.mockResolvedValue(
    diskSpaceSummaryPlentyAvailable
  );
  render(<LowDiskSpaceWarning />);

  // Not visible to start
  await vi.advanceTimersByTimeAsync(DISK_SPACE_POLLING_INTERVAL_MS);
  expect(screen.queryByRole('alertdialog')).toBeNull();

  // Appears when disk space drops
  mockApiClient.getDiskSpaceSummary.mockResolvedValue(
    diskSpaceSummaryLowAvailable
  );
  await vi.advanceTimersByTimeAsync(DISK_SPACE_POLLING_INTERVAL_MS);
  const modal = await screen.findByRole('alertdialog');
  within(modal).getByRole('heading', { name: 'Low Disk Space' });
  within(modal).getByText('Free disk space is down to 1% (97.7 MB of 9.5 GB).');

  // Dismissal
  userEvent.click(within(modal).getByRole('button', { name: 'Dismiss' }));
  await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

  // Reappears if disk space recovers and then drops again
  mockApiClient.getDiskSpaceSummary.mockResolvedValue(
    diskSpaceSummaryPlentyAvailable
  );
  await vi.advanceTimersByTimeAsync(DISK_SPACE_POLLING_INTERVAL_MS);
  expect(screen.queryByRole('alertdialog')).toBeNull();
  mockApiClient.getDiskSpaceSummary.mockResolvedValue(
    diskSpaceSummaryLowAvailable
  );
  await vi.advanceTimersByTimeAsync(DISK_SPACE_POLLING_INTERVAL_MS);
  await screen.findByRole('alertdialog');
});
