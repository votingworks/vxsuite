import { waitFor } from '@testing-library/react';

export const IDLE_TIMEOUT_SECONDS = 5 * 60; // 5 minute

// @coverage-defer
export async function advancePromises(): Promise<void> {
  await waitFor(() => {
    // Wait for promises.
  });
}
