import { act, waitFor } from '@testing-library/react';
import { getTestRunner } from './test_runner';

export const IDLE_TIMEOUT_SECONDS = 5 * 60; // 5 minute

export async function advanceTimers(seconds = 0): Promise<void> {
  const maxSeconds = IDLE_TIMEOUT_SECONDS;
  if (seconds > maxSeconds) {
    throw new Error(`Seconds value should not be greater than ${maxSeconds}`);
  }
  await act(async () => {
    (await getTestRunner()).advanceTimersByTime(seconds * 1000);
  });
}

export async function advancePromises(): Promise<void> {
  await waitFor(() => {
    // Wait for promises.
  });
}

export async function advanceTimersAndPromises(seconds = 0): Promise<void> {
  await advanceTimers(seconds);
  await advancePromises();
}
