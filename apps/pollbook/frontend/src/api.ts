import React from 'react';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { Api, VoterSearchParams } from '@votingworks/pollbook-backend';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  createSystemCallApi,
  QUERY_CLIENT_DEFAULT_OPTIONS,
} from '@votingworks/ui';

export const DEFAULT_QUERY_REFETCH_INTERVAL = 1000;

export type ApiClient = grout.Client<Api>;

export function createApiClient(): ApiClient {
  return grout.createClient<Api>({
    baseUrl: '/api',
  });
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

/* istanbul ignore next */
export function createQueryClient(): QueryClient {
  const defaultQueryOptions = QUERY_CLIENT_DEFAULT_OPTIONS.queries as object;
  return new QueryClient({
    defaultOptions: {
      ...QUERY_CLIENT_DEFAULT_OPTIONS,
      queries: {
        ...defaultQueryOptions,
        staleTime: DEFAULT_QUERY_REFETCH_INTERVAL,
      },
    },
  });
}

export const getPollbookConfigurationInformation = {
  queryKey(): QueryKey {
    return ['getPollbookConfigurationInformation'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getPollbookConfigurationInformation(),
      {
        refetchInterval: 1000,
      }
    );
  },
} as const;

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

export const getUsbDriveStatus = {
  queryKey(): QueryKey {
    return ['getUsbDriveStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getUsbDriveStatus(), {
      refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
    });
  },
} as const;

export const getDeviceStatuses = {
  queryKey(): QueryKey {
    return ['getDeviceStatuses'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getDeviceStatuses(), {
      refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
    });
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

export const getIsAbsenteeMode = {
  queryKey(): QueryKey {
    return ['getIsAbsenteeMode'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getIsAbsenteeMode());
  },
} as const;

export const searchVoters = {
  queryKey(searchParams?: VoterSearchParams): QueryKey {
    return searchParams ? ['searchVoters', searchParams] : ['searchVoters'];
  },
  useQuery(searchParams: VoterSearchParams) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(searchParams),
      () => apiClient.searchVoters({ searchParams }),
      { refetchOnMount: 'always' }
    );
  },
} as const;

export const getVoter = {
  queryKey(voterId?: string): QueryKey {
    return voterId ? ['getVoter', voterId] : ['getVoter'];
  },
  useQuery(voterId: string) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(voterId), () =>
      apiClient.getVoter({ voterId })
    );
  },
} as const;

async function invalidateVoterQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries(getVoter.queryKey());
  await queryClient.resetQueries(searchVoters.queryKey());
}

export const getCheckInCounts = {
  queryKey(): QueryKey {
    return ['getCheckInCounts'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getCheckInCounts(), {
      refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
    });
  },
} as const;

export const getSummaryStatistics = {
  queryKey(): QueryKey {
    return ['getSummaryStatistics'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getSummaryStatistics(), {
      refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
    });
  },
} as const;

export const getThroughputStatistics = {
  queryKey(input?: { throughputInterval: number }): QueryKey {
    return input
      ? ['getThroughputStatistics', input]
      : ['getThroughputStatistics'];
  },
  useQuery(input: { throughputInterval: number }) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(input),
      () => apiClient.getThroughputStatistics(input),
      {
        refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
      }
    );
  },
} as const;

export const getHaveElectionEventsOccurred = {
  queryKey(): QueryKey {
    return ['haveElectionEventsOccurred'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.haveElectionEventsOccurred(),
      {
        refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
      }
    );
  },
} as const;

async function invalidateCheckInQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries(getCheckInCounts.queryKey());
  await queryClient.invalidateQueries(getSummaryStatistics.queryKey());
  await queryClient.invalidateQueries(getThroughputStatistics.queryKey());
}

export const getValidStreetInfo = {
  queryKey(): QueryKey {
    return ['getValidStreetInfo'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getValidStreetInfo());
  },
} as const;

export const getScannedIdDocument = {
  queryKey(): QueryKey {
    return ['getScannedIdDocument'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getScannedIdDocument(), {
      refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
    });
  },
} as const;

export const checkInVoter = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.checkInVoter, {
      async onSuccess() {
        await invalidateVoterQueries(queryClient);
        await invalidateCheckInQueries(queryClient);
      },
    });
  },
} as const;

export const configureFromPeerMachine = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.configureFromPeerMachine, {
      async onSuccess(result) {
        if (result.isOk()) {
          await queryClient.resetQueries();
        }
      },
    });
  },
} as const;

export const undoVoterCheckIn = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.undoVoterCheckIn, {
      async onSuccess() {
        await invalidateVoterQueries(queryClient);
        await invalidateCheckInQueries(queryClient);
      },
    });
  },
} as const;

export const reprintVoterReceipt = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.reprintVoterReceipt);
  },
} as const;

export const resetNetwork = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.resetNetwork, {
      async onSuccess() {
        await queryClient.invalidateQueries(getDeviceStatuses.queryKey());
      },
    });
  },
} as const;

export const changeVoterAddress = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.changeVoterAddress, {
      async onSuccess() {
        await invalidateVoterQueries(queryClient);
      },
    });
  },
} as const;

export const changeVoterName = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.changeVoterName, {
      async onSuccess() {
        await invalidateVoterQueries(queryClient);
      },
    });
  },
} as const;

export const changeVoterMailingAddress = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.changeVoterMailingAddress, {
      async onSuccess() {
        await invalidateVoterQueries(queryClient);
      },
    });
  },
} as const;

export const registerVoter = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.registerVoter, {
      async onSuccess() {
        await invalidateVoterQueries(queryClient);
      },
    });
  },
} as const;

export const markVoterInactive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.markVoterInactive, {
      async onSuccess() {
        await invalidateVoterQueries(queryClient);
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

export const setIsAbsenteeMode = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setIsAbsenteeMode, {
      async onSuccess() {
        await queryClient.invalidateQueries(getIsAbsenteeMode.queryKey());
      },
    });
  },
} as const;

export const setConfiguredPrecinct = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setConfiguredPrecinct, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getPollbookConfigurationInformation.queryKey()
        );
        // because we sort the voters by placing those in the configured precinct
        // first, changing the precinct actually changes the search results
        await invalidateVoterQueries(queryClient);
      },
    });
  },
} as const;

export const exportVoterActivity = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportVoterActivity);
  },
} as const;

export const formatUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.formatUsbDrive);
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);
