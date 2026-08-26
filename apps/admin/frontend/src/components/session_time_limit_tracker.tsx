import { SessionTimeLimitTracker as SessionTimeLimitTrackerBase } from '@votingworks/ui';

import {
  getAuthStatus,
  getSystemSettings,
  logOut,
  updateSessionExpiry,
} from '../api.js';

export function SessionTimeLimitTracker(): JSX.Element {
  const authStatusQuery = getAuthStatus.usePollingQuery();
  const logOutMutation = logOut.useMutation();
  const systemSettingsQuery = getSystemSettings.useQuery();
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
