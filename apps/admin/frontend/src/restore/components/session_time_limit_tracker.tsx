import { SessionTimeLimitTracker as SessionTimeLimitTrackerBase } from '@votingworks/ui';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { getAuthStatus, logOut, updateSessionExpiry } from '../api.js';

export function SessionTimeLimitTracker(): JSX.Element {
  const authStatusQuery = getAuthStatus.usePollingQuery();
  const logOutMutation = logOut.useMutation();
  const updateSessionExpiryMutation = updateSessionExpiry.useMutation();

  return (
    <SessionTimeLimitTrackerBase
      authStatus={authStatusQuery.data}
      // @coverage-defer
      logOut={() => logOutMutation.mutate()}
      systemSettings={DEFAULT_SYSTEM_SETTINGS}
      updateSessionExpiry={(sessionExpiresAt: Date) =>
        // @coverage-defer
        updateSessionExpiryMutation.mutate({ sessionExpiresAt })
      }
    />
  );
}
