import React from 'react';
import { deepEqual } from '@votingworks/basics';
import type { RestoreApi } from '@votingworks/admin-backend';
import * as grout from '@votingworks/grout';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  createSystemCallApi,
  QUERY_CLIENT_DEFAULT_OPTIONS,
  usePollingQuery,
} from '@votingworks/ui';
import {
  QueryClient,
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { DEFAULT_QUERY_REFETCH_INTERVAL } from '../utils/globals.js';

export type ApiClient = grout.Client<RestoreApi>;

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

export const systemCallApi = createSystemCallApi(useApiClient);

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
      // @coverage-exclude
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

export const updateSessionExpiry = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.updateSessionExpiry, {
      // @coverage-exclude
      async onSuccess() {
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const getBackupDriveStatus = {
  queryKey(): QueryKey {
    return ['getBackupDriveStatus'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getBackupDriveStatus(),
      DEFAULT_QUERY_REFETCH_INTERVAL
    );
  },
} as const;

export const listAvailableBackups = {
  queryKey(): QueryKey {
    return ['listAvailableBackups'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.listBackups(), {
      cacheTime: 0,
    });
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
      DEFAULT_QUERY_REFETCH_INTERVAL
    );
  },
} as const;

export const startRestore = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.startRestore, {
      async onSuccess() {
        await queryClient.invalidateQueries(getRestoreStatus.queryKey());
      },
    });
  },
} as const;

export const abortRestore = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.abortRestore, {
      async onSuccess() {
        await queryClient.invalidateQueries(getRestoreStatus.queryKey());
      },
    });
  },
} as const;

export const finishRestore = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.finishRestore, {
      async onSuccess() {
        await queryClient.invalidateQueries(getRestoreStatus.queryKey());
      },
    });
  },
} as const;
