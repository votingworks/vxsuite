import React from 'react';
import { deepEqual } from '@votingworks/basics';
import type { Api } from '@votingworks/central-scan-backend';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  QUERY_CLIENT_DEFAULT_OPTIONS,
  USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
  createSystemCallApi,
} from '@votingworks/ui';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as grout from '@votingworks/grout';
import { Id, Side } from '@votingworks/types';

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

// USB

export const getUsbDriveStatus = {
  queryKey(): QueryKey {
    return ['getUsbDriveStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getUsbDriveStatus(), {
      refetchInterval: USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
      structuralSharing(oldData, newData) {
        if (!oldData) {
          return newData;
        }

        // Prevent unnecessary re-renders of dependent components
        const isUnchanged = deepEqual(oldData, newData);
        return isUnchanged ? oldData : newData;
      },
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
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getAuthStatus(), {
      refetchInterval: AUTH_STATUS_POLLING_INTERVAL_MS,
    });
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

export const getElectionRecord = {
  queryKey(): QueryKey {
    return ['getElectionRecord'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getElectionRecord());
  },
} as const;

export const getStatus = {
  queryKey(): QueryKey {
    return ['getStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getStatus(), {
      refetchInterval: 100,
    });
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

export const getSheetImage = {
  queryKey({ sheetId, side }: { sheetId: Id; side: Side }): QueryKey {
    return ['getSheetImage', sheetId, side];
  },

  useQuery({ sheetId, side }: { sheetId: Id; side: Side }) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey({ sheetId, side }),
      () => apiClient.getSheetImage({ sheetId, side }),
      // Don't let cached images take up memory - there's no benefit to caching them
      {
        cacheTime: 0,
        staleTime: 0,
      }
    );
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

export const saveReadinessReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.saveReadinessReport);
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);
