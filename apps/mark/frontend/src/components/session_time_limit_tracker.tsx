import { SessionTimeLimitTracker as SessionTimeLimitTrackerBase } from '@votingworks/ui';

import {
  getAuthStatus,
  getSystemSettings,
  logOut,
  updateSessionExpiry,
} from '../api';

export function SessionTimeLimitTracker(): JSX.Element {
  const authStatusQuery = getAuthStatus.useQuery();
  const logOutMutation = logOut.useMutation();
  const systemSettingsQuery = getSystemSettings.useQuery();
  const updateSessionExpiryMutation = updateSessionExpiry.useMutation();

  return (
    <SessionTimeLimitTrackerBase
      authStatus={authStatusQuery.data}
      logOut={
        /* istanbul ignore next - @preserve */ () => logOutMutation.mutate()
      }
      systemSettings={systemSettingsQuery.data}
      updateSessionExpiry={
        /* istanbul ignore next - @preserve */ (sessionExpiresAt: Date) =>
          updateSessionExpiryMutation.mutate({ sessionExpiresAt })
      }
    />
  );
}
