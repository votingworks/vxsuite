import { advanceTimers as advanceTimersBase } from '@votingworks/test-utils';
import { waitFor } from '../react_testing_library';
import { AUTH_STATUS_POLLING_INTERVAL_MS_OVERRIDE } from '../../src/constants';

export async function advanceTimers(seconds = 0): Promise<void> {
  await advanceTimersBase(
    seconds || AUTH_STATUS_POLLING_INTERVAL_MS_OVERRIDE / 1000
  );
}

export async function advanceTimersAndPromises(seconds = 0): Promise<void> {
  await advanceTimers(seconds);
  await waitFor(() => {
    // Wait for promises
  });
}
