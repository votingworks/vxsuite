import type { ElectricalTestingApi } from '@votingworks/scan-backend';
import React from 'react';
import { QueryClient, QueryKey, useQuery } from '@tanstack/react-query';
import * as grout from '@votingworks/grout';
import { QUERY_CLIENT_DEFAULT_OPTIONS } from '@votingworks/ui';

export type ApiClient = grout.Client<ElectricalTestingApi>;

export function createApiClient(): ApiClient {
  return grout.createClient<ElectricalTestingApi>({ baseUrl: '/api' });
}

export const ApiClientContext = React.createContext<ApiClient | undefined>(
  undefined
);

export function useApiClient(): ApiClient {
  const apiClient = React.useContext(ApiClientContext);
  if (!apiClient) {
    throw new Error('ApiClientContext.Provider not found');
  }
  return apiClient;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS });
}

export const getElectricalTestingStatusMessages = {
  queryKey(): QueryKey {
    return ['getElectricalTestingStatusMessages'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getElectricalTestingStatusMessages(),
      { refetchInterval: 1000 }
    );
  },
} as const;
