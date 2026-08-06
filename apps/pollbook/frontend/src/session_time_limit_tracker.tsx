import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { SessionTimeLimitTracker as SessionTimeLimitTrackerBase } from '@votingworks/ui';

import { getAuthStatus, logOut, updateSessionExpiry } from './api';

export function SessionTimeLimitTracker(): JSX.Element {
  const authStatusQuery = getAuthStatus.useQuery();
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
