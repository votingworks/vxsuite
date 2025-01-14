import React from 'react';
// import type { Api, BallotMode } from '@votingworks/design-backend';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { Api, VoterSearchParams } from '@votingworks/pollbook-backend';
import { deepEqual } from '@votingworks/basics';
import { AUTH_STATUS_POLLING_INTERVAL_MS } from '@votingworks/ui';

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
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        // In test, we only want to refetch when we explicitly invalidate. In
        // dev/prod, it's fine to refetch more aggressively.
        refetchOnMount: process.env.NODE_ENV !== 'test',
        useErrorBoundary: true,
      },
      mutations: {
        useErrorBoundary: true,
      },
    },
  });
}

export const getAuthStatus = {
  queryKeyPrefix: 'getAuthStatus',
  queryKey(): QueryKey {
    return [this.queryKeyPrefix];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getAuthStatus(), {
      refetchInterval: AUTH_STATUS_POLLING_INTERVAL_MS,
      structuralSharing(oldData, newData) {
        if (!oldData) {
          return newData;
        }

        // Prevent infinite re-renders of the app tree:
        const isUnchanged = deepEqual(oldData, newData);
        return isUnchanged ? oldData : newData;
      },
    });
  },
} as const;

export const checkPin = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.checkPin, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const logOut = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.logOut, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const updateSessionExpiry = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateSessionExpiry, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const getPrinterStatus = {
  queryKey(): QueryKey {
    return ['getPrinterStatus'];
  },
  useQuery(options: { refetchInterval?: number } = {}) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getPrinterStatus(),
      options
    );
  },
} as const;

export const getElection = {
  queryKey(): QueryKey {
    return ['getElection'];
  },
  useQuery(options: { refetchInterval?: number } = {}) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getElection(), options);
  },
} as const;

export const searchVoters = {
  queryKey(searchParams?: VoterSearchParams): QueryKey {
    return searchParams ? ['searchVoters', searchParams] : ['searchVoters'];
  },
  useQuery(searchParams: VoterSearchParams) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(searchParams), () =>
      apiClient.searchVoters({ searchParams })
    );
  },
} as const;

export const getCheckInCounts = {
  queryKey(): QueryKey {
    return ['getCheckInCounts'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getCheckInCounts());
  },
} as const;

export const checkInVoter = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.checkInVoter, {
      async onSuccess() {
        await queryClient.invalidateQueries(searchVoters.queryKey());
        await queryClient.invalidateQueries(getCheckInCounts.queryKey());
      },
    });
  },
} as const;

export const unconfigure = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.unconfigure, {
      async onSuccess() {
        // If we configure with a different election, any data in the cache will
        // correspond to the previous election, so we don't just invalidate, but
        // reset all queries to clear their cached data, since invalidated
        // queries may still return stale data while refetching.
        await queryClient.resetQueries();
      },
    });
  },
} as const;
