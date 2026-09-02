import { SessionTimeLimitTracker as SessionTimeLimitTrackerBase } from '@votingworks/ui';

import { getAuthStatus, getConfig, logOut, updateSessionExpiry } from '../api.js';

export function SessionTimeLimitTracker(): JSX.Element {
  const authStatusQuery = getAuthStatus.useQuery();
  const logOutMutation = logOut.useMutation();
  const configQuery = getConfig.useQuery();
  const updateSessionExpiryMutation = updateSessionExpiry.useMutation();

  return (
    <SessionTimeLimitTrackerBase
      authStatus={authStatusQuery.data}
      // @coverage-defer
      logOut={() => logOutMutation.mutate()}
      systemSettings={configQuery.data?.systemSettings}
      updateSessionExpiry={(sessionExpiresAt: Date) =>
        // @coverage-defer
        updateSessionExpiryMutation.mutate({ sessionExpiresAt })
      }
    />
  );
}
