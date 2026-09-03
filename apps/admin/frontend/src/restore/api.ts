import React from 'react';
import { deepEqual } from '@votingworks/basics';
import type { RestoreApi } from '@votingworks/admin-backend';
import * as grout from '@votingworks/grout';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  QUERY_CLIENT_DEFAULT_OPTIONS,
  USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
  usePollingQuery,
} from '@votingworks/ui';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

/**
 * How often to ask where a restore stands. A restore reports progress as it
 * copies, so this is what makes the progress bar move.
 */
export const RESTORE_STATUS_POLLING_INTERVAL_MS = 500;

export type ApiClient = grout.Client<RestoreApi>;

// @coverage-exclude: used by RestoreApp outside tests
export function createApiClient(): ApiClient {
  return grout.createClient<RestoreApi>({ baseUrl: '/api' });
}

export const ApiClientContext = React.createContext<ApiClient | undefined>(
  undefined
);

export function useApiClient(): ApiClient {
  const apiClient = React.useContext(ApiClientContext);
  // @coverage-exclude
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
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getAuthStatus(),
      AUTH_STATUS_POLLING_INTERVAL_MS,
      {
        structuralSharing(oldData, newData) {
          if (!oldData) {
            return newData;
          }
          return deepEqual(oldData, newData) ? oldData : newData;
        },
      }
    );
  },
} as const;

export const checkPin = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.checkPin, {
      // @coverage-exclude: query invalidation
      async onSuccess() {
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
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const getUsbDriveStatus = {
  queryKey(): QueryKey {
    return ['getUsbDriveStatus'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getUsbDriveStatus(),
      USB_DRIVE_STATUS_POLLING_INTERVAL_MS
    );
  },
} as const;

export const listAvailableBackups = {
  queryKey(): QueryKey {
    return ['listAvailableBackups'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.listAvailableBackups(),
      USB_DRIVE_STATUS_POLLING_INTERVAL_MS
    );
  },
} as const;

export const getRestoreStatus = {
  queryKey(): QueryKey {
    return ['getRestoreStatus'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getRestoreStatus(),
      RESTORE_STATUS_POLLING_INTERVAL_MS
    );
  },
} as const;

export const restoreBackup = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.restoreBackup, {
      // Whatever the outcome, the status is what says so.
      async onSettled() {
        await queryClient.invalidateQueries(getRestoreStatus.queryKey());
      },
    });
  },
} as const;

export const cancelRestore = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.cancelRestore);
  },
} as const;
