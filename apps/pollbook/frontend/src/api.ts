import React from 'react';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  Api,
  PartyFilterAbbreviation,
  VoterSearchParams,
} from '@votingworks/pollbook-backend';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  createSystemCallApi,
  NETWORKED_QUERY_CLIENT_DEFAULT_OPTIONS,
  asMutationFn,
} from '@votingworks/ui';

export const DEFAULT_QUERY_REFETCH_INTERVAL = 1000;

/**
 * Sets the polling interval for the scanned ID document query to be a little
 * faster than the default so the ID scans feel more responsive to the user.
 * It's critical that the polling interval here be lower than the TTL of the
 * scanned ID document in the daemon so scans are not missed.
 */
export const SCANNED_ID_DOCUMENT_POLLING_INTERVAL_MS = 750;

export type ApiClient = grout.Client<Api>;

// @coverage-defer
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
  // @coverage-defer
  if (!apiClient) {
    throw new Error('ApiClientContext.Provider not found');
  }
  return apiClient;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: NETWORKED_QUERY_CLIENT_DEFAULT_OPTIONS,
  });
}

export const getPollbookConfigurationInformation = {
  queryKey(): QueryKey {
    return ['getPollbookConfigurationInformation'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getPollbookConfigurationInformation(),
      refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
    });
  },
} as const;

export const getAuthStatus = {
  queryKeyPrefix: 'getAuthStatus',
  queryKey(): QueryKey {
    return [this.queryKeyPrefix];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getAuthStatus(),
      refetchInterval: AUTH_STATUS_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const checkPin = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.checkPin),

      // @coverage-defer
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries({
          queryKey: getAuthStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const logOut = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.logOut),

      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries({
          queryKey: getAuthStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const updateSessionExpiry = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.updateSessionExpiry),

      // @coverage-defer
      async onSuccess() {
        // Because we poll auth status with high frequency, this invalidation isn't strictly
        // necessary
        await queryClient.invalidateQueries({
          queryKey: getAuthStatus.queryKey(),
        });
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
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getUsbDriveStatus(),
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
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getDeviceStatuses(),
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
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getElection(),
      ...options,
    });
  },
} as const;

export const getIsAbsenteeMode = {
  queryKey(): QueryKey {
    return ['getIsAbsenteeMode'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getIsAbsenteeMode(),
    });
  },
} as const;

export const searchVoters = {
  queryKey(searchParams?: VoterSearchParams): QueryKey {
    return searchParams ? ['searchVoters', searchParams] : ['searchVoters'];
  },
  useQuery(searchParams: VoterSearchParams) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(searchParams),
      queryFn: () => apiClient.searchVoters({ searchParams }),
      refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
    });
  },
} as const;

export const getVoter = {
  queryKey(voterId?: string): QueryKey {
    return voterId ? ['getVoter', voterId] : ['getVoter'];
  },
  useQuery(voterId: string) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(voterId),
      queryFn: () => apiClient.getVoter({ voterId }),
      refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
    });
  },
} as const;

async function invalidateVoterQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries({
    queryKey: getVoter.queryKey(),
  });
  await queryClient.resetQueries({
    queryKey: searchVoters.queryKey(),
  });
}

export const getCheckInCounts = {
  queryKey(): QueryKey {
    return ['getCheckInCounts'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getCheckInCounts(),
      refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
    });
  },
} as const;

export const getGeneralSummaryStatistics = {
  queryKey(input?: { partyFilter: PartyFilterAbbreviation }): QueryKey {
    return input
      ? ['getGeneralSummaryStatistics', input]
      : ['getGeneralSummaryStatistics'];
  },
  useQuery(input: { partyFilter: PartyFilterAbbreviation }) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(input),
      queryFn: () => apiClient.getGeneralSummaryStatistics(input),
      refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
    });
  },
} as const;

export const getPrimarySummaryStatistics = {
  queryKey(input?: { partyFilter: PartyFilterAbbreviation }): QueryKey {
    return input
      ? ['getPrimarySummaryStatistics', input]
      : ['getPrimarySummaryStatistics'];
  },
  useQuery(input: { partyFilter: PartyFilterAbbreviation }) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(input),
      queryFn: () => apiClient.getPrimarySummaryStatistics(input),
      refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
    });
  },
} as const;

export const getThroughputStatistics = {
  queryKey(input?: {
    throughputInterval: number;
    partyFilter: PartyFilterAbbreviation;
  }): QueryKey {
    return input
      ? ['getThroughputStatistics', input]
      : ['getThroughputStatistics'];
  },
  useQuery(input: {
    throughputInterval: number;
    partyFilter: PartyFilterAbbreviation;
  }) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(input),
      queryFn: () => apiClient.getThroughputStatistics(input),
      refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
    });
  },
} as const;

export const getHaveElectionEventsOccurred = {
  queryKey(): QueryKey {
    return ['haveElectionEventsOccurred'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.haveElectionEventsOccurred(),
      refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
    });
  },
} as const;

async function invalidateCheckInQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries({
    queryKey: getCheckInCounts.queryKey(),
  });
  await queryClient.invalidateQueries({
    queryKey: getGeneralSummaryStatistics.queryKey(),
  });
  await queryClient.invalidateQueries({
    queryKey: getPrimarySummaryStatistics.queryKey(),
  });
  await queryClient.invalidateQueries({
    queryKey: getThroughputStatistics.queryKey(),
  });
}

export const getValidStreetInfo = {
  queryKey(): QueryKey {
    return ['getValidStreetInfo'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getValidStreetInfo(),
    });
  },
} as const;

export const getScannedIdDocument = {
  queryKey(): QueryKey {
    return ['getScannedIdDocument'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getScannedIdDocument(),
      refetchInterval: SCANNED_ID_DOCUMENT_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const checkInVoter = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.checkInVoter),

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
    return useMutation({
      // Annotated explicitly: alongside an `onSuccess` that uses its
      // parameters, inference pins the variables type before resolving
      // `asMutationFn`.
      mutationFn: (
        input: Parameters<typeof apiClient.configureFromPeerMachine>[0]
      ) => apiClient.configureFromPeerMachine(input),

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
    return useMutation({
      mutationFn: asMutationFn(apiClient.undoVoterCheckIn),

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
    return useMutation({
      mutationFn: asMutationFn(apiClient.reprintVoterReceipt),
    });
  },
} as const;

export const printPrimaryStatisticsSummaryReceipt = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printPrimaryStatisticsSummaryReceipt),
    });
  },
} as const;

export const printGeneralStatisticsSummaryReceipt = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.printGeneralStatisticsSummaryReceipt),
    });
  },
} as const;

export const resetNetwork = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.resetNetwork),

      // @coverage-defer
      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getDeviceStatuses.queryKey(),
        });
      },
    });
  },
} as const;

export const changeVoterAddress = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.changeVoterAddress),

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
    return useMutation({
      mutationFn: asMutationFn(apiClient.changeVoterName),

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
    return useMutation({
      mutationFn: asMutationFn(apiClient.changeVoterMailingAddress),

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
    return useMutation({
      mutationFn: asMutationFn(apiClient.registerVoter),

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
    return useMutation({
      mutationFn: asMutationFn(apiClient.markVoterInactive),

      async onSuccess() {
        await invalidateVoterQueries(queryClient);
      },
    });
  },
} as const;

export const invalidateRegistration = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.invalidateRegistration),

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
    return useMutation({
      mutationFn: asMutationFn(apiClient.unconfigure),

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
    return useMutation({
      mutationFn: asMutationFn(apiClient.setIsAbsenteeMode),

      // @coverage-defer
      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getIsAbsenteeMode.queryKey(),
        });
      },
    });
  },
} as const;

export const setConfiguredPrecinct = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.setConfiguredPrecinct),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getPollbookConfigurationInformation.queryKey(),
        });
        // because we sort the voters by placing those in the configured precinct
        // first, changing the precinct actually changes the search results
        await invalidateVoterQueries(queryClient);
      },
    });
  },
} as const;

export const exportVoterActivity = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.exportVoterActivity),
    });
  },
} as const;

export const formatUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.formatUsbDrive),
    });
  },
} as const;

export const getActiveAnomalies = {
  queryKey(): QueryKey {
    return ['getActiveAnomalies'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getActiveAnomalies(),
      refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
    });
  },
} as const;

export const dismissAnomaly = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.dismissAnomaly),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getActiveAnomalies.queryKey(),
        });
      },
    });
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);
