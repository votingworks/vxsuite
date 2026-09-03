import React from 'react';
import { deepEqual } from '@votingworks/basics';
import type { Api } from '@votingworks/central-scan-backend';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  QUERY_CLIENT_DEFAULT_OPTIONS,
  USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
  createSystemCallApi,
  usePollingQuery,
  asMutationFn,
} from '@votingworks/ui';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as grout from '@votingworks/grout';
import { Id } from '@votingworks/types';

export type ApiClient = grout.Client<Api>;

// @coverage-defer
export function createApiClient(): ApiClient {
  return grout.createClient<Api>({ baseUrl: '/api' });
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
  return new QueryClient({ defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS });
}

// USB

export const getUsbDriveStatus = {
  queryKey(): QueryKey {
    return ['getUsbDriveStatus'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getUsbDriveStatus(),
      USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
      {
        structuralSharing(oldData, newData) {
          if (!oldData) {
            return newData;
          }

          // Prevent unnecessary re-renders of dependent components
          const isUnchanged = deepEqual(oldData, newData);
          return isUnchanged ? oldData : newData;
        },
      }
    );
  },
} as const;

export const ejectUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.ejectUsbDrive),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getUsbDriveStatus.queryKey(),
        });
      },
    });
  },
} as const;

// Queries

export const getAuthStatus = {
  queryKey(): QueryKey {
    return ['getAuthStatus'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getAuthStatus(),
      AUTH_STATUS_POLLING_INTERVAL_MS
    );
  },
} as const;

export const getDiskSpaceSummary = {
  queryKey(): QueryKey {
    return ['getDiskSpaceSummary'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getDiskSpaceSummary(),
    });
  },
} as const;

export const getTestMode = {
  queryKey(): QueryKey {
    return ['getTestMode'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getTestMode(),
    });
  },
} as const;

export const getSystemSettings = {
  queryKey(): QueryKey {
    return ['getSystemSettings'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getSystemSettings(),
    });
  },
} as const;

export const getMachineConfig = {
  queryKey(): QueryKey {
    return ['getMachineConfig'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getMachineConfig(),
    });
  },
} as const;

export const NETWORK_STATUS_POLLING_INTERVAL_MS = 1000;

export const getNetworkStatus = {
  queryKey(): QueryKey {
    return ['getNetworkStatus'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getNetworkStatus(),
      // Poll only while networking is enabled. When disabled, the status
      // can't change without a restart, so a single fetch suffices.
      (data) => (data?.isEnabled ? NETWORK_STATUS_POLLING_INTERVAL_MS : false)
    );
  },
} as const;

export const getElectionRecord = {
  queryKey(): QueryKey {
    return ['getElectionRecord'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getElectionRecord(),
    });
  },
} as const;

export const STATUS_POLLING_INTERVAL_MS = 100;

export const getStatus = {
  queryKey(): QueryKey {
    return ['getStatus'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getStatus(),
      STATUS_POLLING_INTERVAL_MS
    );
  },
} as const;

export const getMostRecentScannerDiagnostic = {
  queryKey(): QueryKey {
    return ['getMostRecentScannerDiagnostic'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),

      queryFn: () => apiClient.getMostRecentScannerDiagnostic(),
    });
  },
} as const;

export const getMostRecentUpsDiagnostic = {
  queryKey(): QueryKey {
    return ['getMostRecentUpsDiagnostic'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),

      queryFn: () => apiClient.getMostRecentUpsDiagnostic(),
    });
  },
} as const;

export const getSheetForReview = {
  queryKey(sheetId: Id): QueryKey {
    return ['getSheetForReview', sheetId];
  },

  useQuery(sheetId: Id) {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(sheetId),
      queryFn: () => apiClient.getSheetForReview({ sheetId }),
    });
  },
} as const;

export const getPollingPlaceId = {
  queryKey(): QueryKey {
    return ['getPollingPlaceId'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery({
      queryKey: this.queryKey(),
      queryFn: () => apiClient.getPollingPlaceId(),
    });
  },
} as const;

// Mutations

export const setTestMode = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.setTestMode),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getTestMode.queryKey(),
        });
      },
    });
  },
} as const;

export const setPollingPlaceId = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.setPollingPlaceId),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getPollingPlaceId.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const checkPin = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.checkPin),

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
    return useMutation({
      mutationFn: asMutationFn(apiClient.updateSessionExpiry),
    });
  },
} as const;

export const scanBatch = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.scanBatch),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const acceptSheet = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.acceptSheet),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const rejectSheet = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.rejectSheet),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const retrySendBatchToAdmin = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.retrySendBatchToAdmin),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const resendBatchToAdmin = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.resendBatchToAdmin),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const deleteBatch = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.deleteBatch),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getStatus.queryKey(),
        });
      },
    });
  },
} as const;

export const configureFromElectionPackageOnUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(
        apiClient.configureFromElectionPackageOnUsbDrive
      ),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getSystemSettings.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: getElectionRecord.queryKey(),
        });
        // Configuring may auto-select a polling place.
        await queryClient.invalidateQueries({
          queryKey: getPollingPlaceId.queryKey(),
        });
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

export const clearBallotData = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.clearBallotData),
    });
  },
} as const;

export const exportCastVoteRecordsToUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.exportCastVoteRecordsToUsbDrive),
    });
  },
} as const;

export const performScanDiagnostic = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.performScanDiagnostic),

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getMostRecentScannerDiagnostic.queryKey(),
        });
      },
    });
  },
} as const;

export const logMostRecentUpsDiagnosticOutcome = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.logUpsDiagnosticOutcome),

      // @coverage-defer
      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: getMostRecentUpsDiagnostic.queryKey(),
        });
      },
    });
  },
} as const;

export const saveReadinessReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation({
      mutationFn: asMutationFn(apiClient.saveReadinessReport),
    });
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);
