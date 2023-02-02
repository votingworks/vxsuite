import useInterval from 'use-interval';
import { DippedSmartCardAuth } from '@votingworks/types';
import { useState } from 'react';

const AUTH_STATUS_POLLING_INTERVAL_MS = 100;

export interface ApiClient {
  getAuthStatus: () => Promise<DippedSmartCardAuth.AuthStatus>;
}

export function useDippedSmartCardAuth(
  apiClient: ApiClient
): DippedSmartCardAuth.AuthStatus {
  const [authStatus, setAuthStatus] = useState<DippedSmartCardAuth.AuthStatus>(
    DippedSmartCardAuth.DEFAULT_AUTH_STATUS
  );

  useInterval(
    async () => {
      const newAuthStatus = await apiClient.getAuthStatus();
      setAuthStatus(newAuthStatus);
    },
    AUTH_STATUS_POLLING_INTERVAL_MS,
    true
  );

  return authStatus;
}
