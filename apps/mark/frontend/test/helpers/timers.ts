import { vi } from 'vitest';
import { AUTH_STATUS_POLLING_INTERVAL_MS } from '@votingworks/ui';
import { act } from '../react_testing_library';

export function advanceTimers(seconds = 0): void {
  act(() => {
    vi.advanceTimersByTime(seconds * 1000 || AUTH_STATUS_POLLING_INTERVAL_MS);
  });
}

export async function advanceTimersAndPromises(seconds = 0): Promise<void> {
  advanceTimers(seconds);
  await vi.waitFor(() => {
    // Wait for promises
  });
}
