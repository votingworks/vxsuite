import { AUTH_STATUS_POLLING_INTERVAL_MS } from '@votingworks/ui';
import { act, waitFor } from '../react_testing_library';

export function advanceTimers(seconds = 0): void {
  act(() => {
    jest.advanceTimersByTime(seconds * 1000 || AUTH_STATUS_POLLING_INTERVAL_MS);
  });
}

export async function advanceTimersAndPromises(seconds = 0): Promise<void> {
  advanceTimers(seconds);
  await waitFor(() => {
    // Wait for promises
  });
}
