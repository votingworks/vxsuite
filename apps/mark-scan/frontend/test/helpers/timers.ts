import { vi } from 'vitest';
import { act } from '../react_testing_library';
import { AUTH_STATUS_POLLING_INTERVAL_MS_OVERRIDE } from '../../src/constants';

export function advanceTimers(seconds = 0): void {
  act(() => {
    vi.advanceTimersByTime(
      seconds * 1000 || AUTH_STATUS_POLLING_INTERVAL_MS_OVERRIDE
    );
  });
}

export async function advanceTimersAndPromises(seconds = 0): Promise<void> {
  advanceTimers(seconds);
  await vi.waitFor(() => {
    // Wait for promises
  });
}
