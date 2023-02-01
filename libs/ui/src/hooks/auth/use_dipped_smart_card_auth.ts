import useInterval from 'use-interval';
import { DippedSmartCardAuth } from '@votingworks/types';
import { useEffect, useState } from 'react';

const AUTH_STATUS_POLLING_INTERVAL_MS = 100;

export interface AuthApiClient {
  getAuthStatus: () => Promise<DippedSmartCardAuth.AuthStatus>;
  logOut: () => Promise<void>;
}

export function useDippedSmartCardAuth(
  authApiClient: AuthApiClient
): DippedSmartCardAuth.AuthStatus {
  const [authStatus, setAuthStatus] = useState<DippedSmartCardAuth.AuthStatus>(
    DippedSmartCardAuth.DEFAULT_AUTH_STATUS
  );
  const [hasBeenReset, setHasBeenReset] = useState(false);

  useEffect(() => {
    async function logOut() {
      await authApiClient.logOut();
      setHasBeenReset(true);
    }
    void logOut();
    // Log out once on mount to avoid inconsistencies between the backend and the frontend when the
    // frontend restarts and the backend does not (e.g. during frontend development)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useInterval(
    async () => {
      if (!hasBeenReset) {
        return;
      }
      const newAuthStatus = await authApiClient.getAuthStatus();
      setAuthStatus(newAuthStatus);
    },
    AUTH_STATUS_POLLING_INTERVAL_MS,
    true
  );

  return authStatus;
}
