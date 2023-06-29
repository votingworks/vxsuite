import { SessionTimeLimitTracker as SessionTimeLimitTrackerBase } from '@votingworks/ui';

import { getAuthStatus, getConfig, logOut, updateSessionExpiry } from '../api';

export function SessionTimeLimitTracker(): JSX.Element {
  const authStatusQuery = getAuthStatus.useQuery();
  const logOutMutation = logOut.useMutation();
  const configQuery = getConfig.useQuery();
  const updateSessionExpiryMutation = updateSessionExpiry.useMutation();

  return (
    <SessionTimeLimitTrackerBase
      authStatus={authStatusQuery.data}
      logOut={() => logOutMutation.mutate()}
      systemSettings={configQuery.data?.systemSettings}
      updateSessionExpiry={(sessionExpiresAt: Date) =>
        updateSessionExpiryMutation.mutate({ sessionExpiresAt })
      }
    />
  );
}
