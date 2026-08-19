import React from 'react';
import * as grout from '@votingworks/grout';
import type { SmartCardAuthApi } from '@votingworks/design-backend';
import {
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { AUTH_STATUS_POLLING_INTERVAL_MS } from '@votingworks/ui';

export type SmartCardAuthApiClient = grout.Client<SmartCardAuthApi>;

export function createSmartCardAuthApiClient(): SmartCardAuthApiClient {
  return grout.createClient<SmartCardAuthApi>({ baseUrl: '/auth/api' });
}

export const SmartCardAuthApiClientContext = React.createContext<
  SmartCardAuthApiClient | undefined
>(undefined);

export function useSmartCardAuthApiClient(): SmartCardAuthApiClient {
  const apiClient = React.useContext(SmartCardAuthApiClientContext);
  if (!apiClient) {
    throw new Error('SmartCardAuthApiClientContext.Provider not found');
  }
  return apiClient;
}

export const getAuthStatus = {
  queryKey(): QueryKey {
    return ['getAuthStatus'];
  },
  useQuery() {
    const apiClient = useSmartCardAuthApiClient();
    return useQuery(this.queryKey(), () => apiClient.getAuthStatus(), {
      // Deployments that don't use smart card auth return no auth status, so
      // there's nothing to poll for.
      refetchInterval: (authStatus) =>
        authStatus ? AUTH_STATUS_POLLING_INTERVAL_MS : false,
    });
  },
} as const;

export const checkPin = {
  useMutation() {
    const apiClient = useSmartCardAuthApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.checkPin, {
      async onSuccess() {
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;
