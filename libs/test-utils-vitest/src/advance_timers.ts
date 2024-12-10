import { vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';

export const IDLE_TIMEOUT_SECONDS = 5 * 60; // 5 minute

export function advanceTimers(seconds = 0): void {
  const maxSeconds = IDLE_TIMEOUT_SECONDS;
  if (seconds > maxSeconds) {
    throw new Error(`Seconds value should not be greater than ${maxSeconds}`);
  }
  act(() => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

export async function advancePromises(): Promise<void> {
  await waitFor(() => {
    // Wait for promises.
  });
}

export async function advanceTimersAndPromises(seconds = 0): Promise<void> {
  advanceTimers(seconds);
  await advancePromises();
}
