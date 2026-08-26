import React from 'react';
import { deepEqual } from '@votingworks/basics';
import type { Api } from '@votingworks/central-scan-backend';
import {
  QUERY_CLIENT_DEFAULT_OPTIONS,
  createSystemCallApi,
} from '@votingworks/ui';
import {
  QueryClient,
  QueryKey,
  UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as grout from '@votingworks/grout';

export type ApiClient = grout.Client<Api>;

type QueryOutput<Method extends keyof ApiClient> = Awaited<
  ReturnType<ApiClient[Method]>
>;

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

// USB

export const getUsbDriveStatus = {
  queryKey(): QueryKey {
    return ['getUsbDriveStatus'];
  },
  /**
   * `AppRoot` (which is always mounted) is the only component that should
   * pass a `refetchInterval`. react-query runs a separate refetch timer for
   * every observer that sets one, so a second polling component would
   * multiply the request rate to the backend. Everything else should
   * subscribe with `useQuery()` and receive updates through the shared query
   * cache.
   */
  useQuery(options: UseQueryOptions<QueryOutput<'getUsbDriveStatus'>> = {}) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getUsbDriveStatus(), {
      structuralSharing(oldData, newData) {
        if (!oldData) {
          return newData;
        }

        // Prevent unnecessary re-renders of dependent components
        const isUnchanged = deepEqual(oldData, newData);
        return isUnchanged ? oldData : newData;
      },
      ...options,
    });
  },
} as const;

export const ejectUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.ejectUsbDrive, {
      async onSuccess() {
        await queryClient.invalidateQueries(getUsbDriveStatus.queryKey());
      },
    });
  },
} as const;

// Queries

export const getAuthStatus = {
  queryKey(): QueryKey {
    return ['getAuthStatus'];
  },
  /**
   * `AppRoot` (which is always mounted) is the only component that should
   * pass a `refetchInterval`. react-query runs a separate refetch timer for
   * every observer that sets one, so a second polling component would
   * multiply the request rate to the backend. Everything else should
   * subscribe with `useQuery()` and receive updates through the shared query
   * cache.
   */
  useQuery(options?: UseQueryOptions<QueryOutput<'getAuthStatus'>>) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getAuthStatus(), options);
  },
} as const;

export const getDiskSpaceSummary = {
  queryKey(): QueryKey {
    return ['getDiskSpaceSummary'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getDiskSpaceSummary());
  },
} as const;

export const getTestMode = {
  queryKey(): QueryKey {
    return ['getTestMode'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getTestMode());
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

export const getMachineConfig = {
  queryKey(): QueryKey {
    return ['getMachineConfig'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getMachineConfig());
  },
} as const;

export const NETWORK_STATUS_POLLING_INTERVAL_MS = 1000;

/**
 * Poll only while networking is enabled. When disabled, the status can't
 * change without a restart, so a single fetch suffices.
 */
export function networkStatusRefetchInterval(
  data?: QueryOutput<'getNetworkStatus'>
): number | false {
  return data?.isEnabled ? NETWORK_STATUS_POLLING_INTERVAL_MS : false;
}

export const getNetworkStatus = {
  queryKey(): QueryKey {
    return ['getNetworkStatus'];
  },
  /**
   * `AppRoot` (which is always mounted) is the only component that should
   * pass a `refetchInterval`. react-query runs a separate refetch timer for
   * every observer that sets one, so a second polling component would
   * multiply the request rate to the backend. Everything else should
   * subscribe with `useQuery()` and receive updates through the shared query
   * cache.
   */
  useQuery(options?: UseQueryOptions<QueryOutput<'getNetworkStatus'>>) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getNetworkStatus(),
      options
    );
  },
} as const;

export const getElectionRecord = {
  queryKey(): QueryKey {
    return ['getElectionRecord'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getElectionRecord());
  },
} as const;

export const STATUS_POLLING_INTERVAL_MS = 100;

export const getStatus = {
  queryKey(): QueryKey {
    return ['getStatus'];
  },
  /**
   * `AppRoot` (which is always mounted) is the only component that should
   * pass a `refetchInterval`. react-query runs a separate refetch timer for
   * every observer that sets one, so a second polling component would
   * multiply the request rate to the backend. Everything else should
   * subscribe with `useQuery()` and receive updates through the shared query
   * cache.
   */
  useQuery(options?: UseQueryOptions<QueryOutput<'getStatus'>>) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getStatus(), options);
  },
} as const;

export const getMostRecentScannerDiagnostic = {
  queryKey(): QueryKey {
    return ['getMostRecentScannerDiagnostic'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getMostRecentScannerDiagnostic()
    );
  },
} as const;

export const getMostRecentUpsDiagnostic = {
  queryKey(): QueryKey {
    return ['getMostRecentUpsDiagnostic'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getMostRecentUpsDiagnostic()
    );
  },
} as const;

export const getNextReviewSheet = {
  queryKey(): QueryKey {
    return ['getNextReviewSheet'];
  },

  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getNextReviewSheet(), {
      // Always refetch - using cached data could result in flashes of old data or even blank
      // screens, as getNextReviewSheet intentionally returns null when there are no sheets left to
      // review
      cacheTime: 0,
      staleTime: 0,
    });
  },
} as const;

export const getPollingPlaceId = {
  queryKey(): QueryKey {
    return ['getPollingPlaceId'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getPollingPlaceId());
  },
} as const;

// Mutations

export const setTestMode = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setTestMode, {
      async onSuccess() {
        await queryClient.invalidateQueries(getTestMode.queryKey());
      },
    });
  },
} as const;

export const setPollingPlaceId = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setPollingPlaceId, {
      async onSuccess() {
        await queryClient.invalidateQueries(getPollingPlaceId.queryKey());
        await queryClient.invalidateQueries(getStatus.queryKey());
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
    return useMutation(apiClient.updateSessionExpiry);
  },
} as const;

export const scanBatch = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.scanBatch, {
      async onSuccess() {
        await queryClient.invalidateQueries(getStatus.queryKey());
      },
    });
  },
} as const;

export const continueScanning = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.continueScanning, {
      async onSuccess() {
        await queryClient.invalidateQueries(getStatus.queryKey());
        await queryClient.invalidateQueries(getNextReviewSheet.queryKey());
      },
    });
  },
} as const;

export const deleteBatch = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.deleteBatch, {
      async onSuccess() {
        await queryClient.invalidateQueries(getStatus.queryKey());
      },
    });
  },
} as const;

export const configureFromElectionPackageOnUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.configureFromElectionPackageOnUsbDrive, {
      async onSuccess() {
        await queryClient.invalidateQueries(getSystemSettings.queryKey());
        await queryClient.invalidateQueries(getElectionRecord.queryKey());
        // Configuring may auto-select a polling place.
        await queryClient.invalidateQueries(getPollingPlaceId.queryKey());
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

export const clearBallotData = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.clearBallotData);
  },
} as const;

export const exportCastVoteRecordsToUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportCastVoteRecordsToUsbDrive);
  },
} as const;

export const performScanDiagnostic = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.performScanDiagnostic, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getMostRecentScannerDiagnostic.queryKey()
        );
      },
    });
  },
} as const;

export const logMostRecentUpsDiagnosticOutcome = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.logUpsDiagnosticOutcome, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getMostRecentUpsDiagnostic.queryKey()
        );
      },
    });
  },
} as const;

export const saveReadinessReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.saveReadinessReport);
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);
