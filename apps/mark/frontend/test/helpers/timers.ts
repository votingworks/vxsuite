import { waitFor } from '@testing-library/react';
import { advanceTimers as advanceTimersBase } from '@votingworks/test-utils';
import { AUTH_STATUS_POLLING_INTERVAL_MS } from '@votingworks/ui';

export function advanceTimers(seconds = 0): void {
  advanceTimersBase(seconds || AUTH_STATUS_POLLING_INTERVAL_MS / 1000);
}

export async function advanceTimersAndPromises(seconds = 0): Promise<void> {
  advanceTimers(seconds);
  await waitFor(() => {
    // Wait for promises
  });
}
