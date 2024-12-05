import { advanceTimers as advanceTimersBase } from '@votingworks/test-utils';
import { AUTH_STATUS_POLLING_INTERVAL_MS } from '@votingworks/ui';
import { waitFor } from '../react_testing_library';

export async function advanceTimers(seconds = 0): Promise<void> {
  await advanceTimersBase(seconds || AUTH_STATUS_POLLING_INTERVAL_MS / 1000);
}

export async function advanceTimersAndPromises(seconds = 0): Promise<void> {
  await advanceTimers(seconds);
  await waitFor(() => {
    // Wait for promises
  });
}
