import React from 'react';
import { SessionTimeLimitTracker as SessionTimeLimitTrackerBase } from '@votingworks/ui';

import { getAuthStatus, logOut, updateSessionExpiry } from '../api';

interface Props {
  electionHash?: string;
}

export function SessionTimeLimitTracker({ electionHash }: Props): JSX.Element {
  const authStatusQuery = getAuthStatus.useQuery(electionHash);
  const logOutMutation = logOut.useMutation(electionHash);
  const updateSessionExpiryMutation =
    updateSessionExpiry.useMutation(electionHash);

  return (
    <SessionTimeLimitTrackerBase
      authStatus={authStatusQuery.data}
      logOut={/* istanbul ignore next */ () => logOutMutation.mutate()}
      updateSessionExpiry={
        /* istanbul ignore next */ (sessionExpiresAt: Date) =>
          updateSessionExpiryMutation.mutate({ sessionExpiresAt })
      }
    />
  );
}
