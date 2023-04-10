import React from 'react';
import { SessionTimeLimitTracker as SessionTimeLimitTrackerBase } from '@votingworks/ui';

import { getAuthStatus, logOut, updateSessionExpiry } from '../api';

export function SessionTimeLimitTracker(): JSX.Element {
  const authStatusQuery = getAuthStatus.useQuery();
  const logOutMutation = logOut.useMutation();
  const updateSessionExpiryMutation = updateSessionExpiry.useMutation();

  return (
    <SessionTimeLimitTrackerBase
      authStatus={authStatusQuery.data}
      logOut={() => logOutMutation.mutate()}
      updateSessionExpiry={(sessionExpiresAt: Date) =>
        updateSessionExpiryMutation.mutate({ sessionExpiresAt })
      }
    />
  );
}
