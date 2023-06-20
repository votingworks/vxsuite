import React from 'react';
import type { Api } from '@votingworks/design-backend';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

export type ApiClient = grout.Client<Api>;

export function createApiClient(): ApiClient {
  return grout.createClient<Api>({ baseUrl: '/api' });
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
  return new QueryClient();
}

export const getElection = {
  queryKey(): QueryKey {
    return ['getElection'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getElection());
  },
} as const;

export const setElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setElection, {
      async onSuccess() {
        await queryClient.invalidateQueries(getElection.queryKey());
      },
    });
  },
} as const;

export const exportAllBallots = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportAllBallots);
  },
} as const;

export const exportBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportBallot);
  },
} as const;

export const exportBallotDefinition = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportBallotDefinition);
  },
} as const;
