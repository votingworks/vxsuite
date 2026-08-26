import { SessionTimeLimitTracker as SessionTimeLimitTrackerBase } from '@votingworks/ui';

import {
  getAuthStatus,
  getSystemSettings,
  logOut,
  updateSessionExpiry,
} from '../api.js';
import { DEFAULT_QUERY_REFETCH_INTERVAL } from '../../utils/globals.js';

export function SessionTimeLimitTracker(): JSX.Element {
  const authStatusQuery = getAuthStatus.useQuery();
  const logOutMutation = logOut.useMutation();
  // SessionTimeLimitTracker is always mounted and is the single system
  // settings poller; other components subscribe without a `refetchInterval`
  // and receive updates through the shared query cache.
  const systemSettingsQuery = getSystemSettings.useQuery({
    refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
  });
  const updateSessionExpiryMutation = updateSessionExpiry.useMutation();

  return (
    <SessionTimeLimitTrackerBase
      authStatus={authStatusQuery.data}
      logOut={() => logOutMutation.mutate()}
      systemSettings={systemSettingsQuery.data}
      updateSessionExpiry={(sessionExpiresAt: Date) =>
        updateSessionExpiryMutation.mutate({ sessionExpiresAt })
      }
    />
  );
}
