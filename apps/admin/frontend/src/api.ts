import React from 'react';
import type { Api } from '@votingworks/admin-backend';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  QUERY_CLIENT_DEFAULT_OPTIONS,
} from '@votingworks/ui';
import {
  Query,
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as grout from '@votingworks/grout';
import { Id } from '@votingworks/types';

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
  queryKeyPrefix: 'getMachineConfig',
  queryKey(): QueryKey {
    return [this.queryKeyPrefix];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getMachineConfig());
  },
} as const;

// Auth

export const getAuthStatus = {
  queryKeyPrefix: 'getAuthStatus',
  queryKey(): QueryKey {
    return [this.queryKeyPrefix];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getAuthStatus(), {
      refetchInterval: AUTH_STATUS_POLLING_INTERVAL_MS,
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

export const programCard = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.programCard, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const unprogramCard = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.unprogramCard, {
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

// Queries

type QueryInput<Method extends keyof ApiClient> = Parameters<
  ApiClient[Method]
>[0];

export const getCurrentElectionMetadata = {
  queryKey(): QueryKey {
    return ['getCurrentElectionMetadata'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getCurrentElectionMetadata()
    );
  },
} as const;

export const listCastVoteRecordFilesOnUsb = {
  queryKey(): QueryKey {
    return ['listCastVoteRecordFilesOnUsb'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.listCastVoteRecordFilesOnUsb()
    );
  },
} as const;

export const getCastVoteRecordFiles = {
  queryKey(): QueryKey {
    return ['getCastVoteRecordFiles'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getCastVoteRecordFiles());
  },
} as const;

export const getCastVoteRecords = {
  queryKey(): QueryKey {
    return ['getCastVoteRecords'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getCastVoteRecords());
  },
} as const;

export const getCastVoteRecordFileMode = {
  queryKey(): QueryKey {
    return ['getCastVoteRecordFileMode'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getCastVoteRecordFileMode()
    );
  },
} as const;

type GetWriteInsInput = QueryInput<'getWriteIns'>;
export const getWriteIns = {
  queryKey(input?: GetWriteInsInput): QueryKey {
    return input ? ['getWriteIns', input] : ['getWriteIns'];
  },
  useQuery(input?: GetWriteInsInput) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(input), () => apiClient.getWriteIns(input));
  },
} as const;

type GetWriteInSummaryInput = QueryInput<'getWriteInSummary'>;
export const getWriteInSummary = {
  queryKey(input?: GetWriteInSummaryInput): QueryKey {
    return input ? ['getWriteInSummary', input] : ['getWriteInSummary'];
  },
  useQuery(input?: GetWriteInSummaryInput) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(input), () =>
      apiClient.getWriteInSummary(input)
    );
  },
} as const;

type GetWriteInCandidatesInput = QueryInput<'getWriteInCandidates'>;
export const getWriteInCandidates = {
  queryKey(input?: GetWriteInCandidatesInput): QueryKey {
    return input ? ['getWriteInCandidates', input] : ['getWriteInCandidates'];
  },
  useQuery(input?: GetWriteInCandidatesInput) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(input), () =>
      apiClient.getWriteInCandidates(input)
    );
  },
} as const;

interface GetWriteInDetailViewInput {
  castVoteRecordId: Id;
  contestId: Id;
  writeInId: Id;
}
export const getWriteInDetailView = {
  queryKey(input?: GetWriteInDetailViewInput): QueryKey {
    return input
      ? [
          'getWriteInDetailView',
          input.castVoteRecordId,
          input.contestId,
          input.writeInId,
        ]
      : ['getWriteInDetailView'];
  },
  invalidateRelatedWriteInDetailViewQueries(
    queryClient: QueryClient,
    { castVoteRecordId, contestId, writeInId }: GetWriteInDetailViewInput
  ) {
    return queryClient.invalidateQueries({
      predicate(query) {
        return (
          query.queryKey[0] === 'getWriteInDetailView' &&
          query.queryKey[1] === castVoteRecordId &&
          query.queryKey[2] === contestId &&
          query.queryKey[3] !== writeInId
        );
      },
    });
  },
  useQuery(input: GetWriteInDetailViewInput, enabled = true) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      () => apiClient.getWriteInDetailView({ writeInId: input.writeInId }),
      { enabled }
    );
  },
} as const;

export const getSystemSettings = {
  queryKey(): QueryKey {
    return ['getSystemSettings'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getSystemSettings());
  },
} as const;

export const getFullElectionManualTally = {
  queryKey(): QueryKey {
    return ['getFullElectionManualTally'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getFullElectionManualTally()
    );
  },
} as const;

// Grouped Invalidations

function invalidateCastVoteRecordQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries(getCastVoteRecordFileMode.queryKey()),
    queryClient.invalidateQueries(getCastVoteRecordFiles.queryKey()),
    queryClient.invalidateQueries(getCastVoteRecords.queryKey()),
  ]);
}

function invalidateWriteInQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries(getWriteIns.queryKey()),
    queryClient.invalidateQueries(getWriteInSummary.queryKey()),
    queryClient.invalidateQueries(getWriteInCandidates.queryKey()),
  ]);
}

// Mutations

export const configure = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.configure, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getCurrentElectionMetadata.queryKey()
        );
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
        // invalidate all queries except a select few
        await queryClient.invalidateQueries({
          predicate: (query: Query) => {
            const queryKeyPrefix = query.queryKey[0];
            return (
              getMachineConfig.queryKeyPrefix !== queryKeyPrefix &&
              getAuthStatus.queryKeyPrefix !== queryKeyPrefix
            );
          },
        });
      },
    });
  },
} as const;

export const markResultsOfficial = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.markResultsOfficial, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getCurrentElectionMetadata.queryKey()
        );
      },
    });
  },
} as const;

export const clearCastVoteRecordFiles = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.clearCastVoteRecordFiles, {
      async onSuccess() {
        return Promise.all([
          invalidateCastVoteRecordQueries(queryClient),
          invalidateWriteInQueries(queryClient),
          queryClient.invalidateQueries(getWriteInDetailView.queryKey()),
          queryClient.invalidateQueries(getCurrentElectionMetadata.queryKey()),
        ]);
      },
    });
  },
} as const;

export const addCastVoteRecordFile = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.addCastVoteRecordFile, {
      async onSuccess() {
        await invalidateCastVoteRecordQueries(queryClient);
        await invalidateWriteInQueries(queryClient);
      },
    });
  },
} as const;

export const setManualTally = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setManualTally, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getFullElectionManualTally.queryKey()
        );
        await invalidateWriteInQueries(queryClient);
      },
    });
  },
} as const;

export const deleteAllManualTallies = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.deleteAllManualTallies, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getFullElectionManualTally.queryKey()
        );
        await invalidateWriteInQueries(queryClient);
      },
    });
  },
} as const;

export const addWriteInCandidate = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.addWriteInCandidate, {
      async onSuccess() {
        await queryClient.invalidateQueries(getWriteInCandidates.queryKey());
      },
    });
  },
} as const;

export const adjudicateWriteIn = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.adjudicateWriteIn, {
      async onSuccess() {
        await invalidateWriteInQueries(queryClient);
      },
    });
  },
} as const;

export const setSystemSettings = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setSystemSettings, {
      async onSuccess() {
        await queryClient.invalidateQueries(getSystemSettings.queryKey());
      },
    });
  },
} as const;
