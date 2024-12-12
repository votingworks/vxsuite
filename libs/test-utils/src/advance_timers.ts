import { waitFor } from '@testing-library/react';

export const IDLE_TIMEOUT_SECONDS = 5 * 60; // 5 minute

export async function advancePromises(): Promise<void> {
  await waitFor(() => {
    // Wait for promises.
  });
}
