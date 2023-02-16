/* eslint-disable vx/gts-no-import-export-type */
import type { Api } from '@votingworks/mark-backend';
import React from 'react';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from '@tanstack/react-query';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  QUERY_CLIENT_DEFAULT_OPTIONS,
} from '@votingworks/ui';
import {
  BallotStyleId,
  ElectionDefinition,
  Optional,
  PrecinctId,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { ok, Result } from '@votingworks/basics';

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
  return new QueryClient({ defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS });
}

export const getMachineConfig = {
  queryKey(): QueryKey {
    return ['getMachineConfig'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getMachineConfig());
  },
} as const;

export const getAuthStatus = {
  queryKey(): QueryKey {
    return ['getAuthStatus'];
  },
  // TODO: Once election definition has been moved to the backend, no longer require election hash
  // to be provided here and in other auth/card queries/mutations
  useQuery(electionHash?: string) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getAuthStatus({ electionHash }),
      { refetchInterval: AUTH_STATUS_POLLING_INTERVAL_MS }
    );
  },
} as const;

export const getElectionDefinitionFromCard = {
  queryKey(): QueryKey {
    return ['getElectionDefinitionFromCard'];
  },
  useQuery(
    electionHash?: string,
    options: UseQueryOptions<Result<Optional<ElectionDefinition>, Error>> = {}
  ) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      async () => {
        const result = await apiClient.readElectionDefinitionFromCard({
          electionHash,
        });
        const electionData = result.ok();
        const electionDefinition = electionData
          ? safeParseElectionDefinition(electionData).ok()
          : undefined;
        return ok<Optional<ElectionDefinition>, Error>(electionDefinition);
      },
      // Don't cache this since caching would require invalidation in response to external
      // circumstances, like card removal
      { cacheTime: 0, staleTime: 0, ...options }
    );
  },
} as const;

export const getScannerReportDataFromCard = {
  queryKey(): QueryKey {
    return ['getScannerReportDataFromCard'];
  },
  useQuery(electionHash?: string) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.readScannerReportDataFromCard({ electionHash }),
      // Don't cache this since caching would require invalidation in response to external
      // circumstances, like card removal
      { cacheTime: 0, staleTime: 0 }
    );
  },
} as const;

export const checkPin = {
  useMutation(electionHash?: string) {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      (input: { pin: string }) =>
        apiClient.checkPin({ ...input, electionHash }),
      {
        async onSuccess() {
          // Because we poll auth status with high frequency, this invalidation isn't strictly
          // necessary
          await queryClient.invalidateQueries(getAuthStatus.queryKey());
        },
      }
    );
  },
} as const;

export const startCardlessVoterSession = {
  useMutation(electionHash?: string) {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      (input: { ballotStyleId: BallotStyleId; precinctId: PrecinctId }) =>
        apiClient.startCardlessVoterSession({ ...input, electionHash }),
      {
        async onSuccess() {
          // Because we poll auth status with high frequency, this invalidation isn't strictly
          // necessary
          await queryClient.invalidateQueries(getAuthStatus.queryKey());
        },
      }
    );
  },
} as const;

export const endCardlessVoterSession = {
  useMutation(electionHash?: string) {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      () => apiClient.endCardlessVoterSession({ electionHash }),
      {
        async onSuccess() {
          // Because we poll auth status with high frequency, this invalidation isn't strictly
          // necessary
          await queryClient.invalidateQueries(getAuthStatus.queryKey());
        },
      }
    );
  },
} as const;

export const clearScannerReportDataFromCard = {
  useMutation(electionHash?: string) {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      () => apiClient.clearScannerReportDataFromCard({ electionHash }),
      {
        async onSuccess() {
          // Because we don't cache scanner report data from cards, this invalidation isn't
          // strictly necessary
          await queryClient.invalidateQueries(
            getScannerReportDataFromCard.queryKey()
          );
        },
      }
    );
  },
} as const;
