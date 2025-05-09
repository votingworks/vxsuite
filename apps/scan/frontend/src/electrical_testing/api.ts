import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as grout from '@votingworks/grout';
import type { ElectricalTestingApi } from '@votingworks/scan-backend';
import {
  createSystemCallApi,
  QUERY_CLIENT_DEFAULT_OPTIONS,
} from '@votingworks/ui';
import React from 'react';

export type ApiClient = grout.Client<ElectricalTestingApi>;

export function createApiClient(): ApiClient {
  return grout.createClient<ElectricalTestingApi>({ baseUrl: '/api' });
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

export const getElectricalTestingStatuses = {
  queryKey(): QueryKey {
    return ['getElectricalTestingStatuses'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getElectricalTestingStatuses(),
      { refetchInterval: 200 }
    );
  },
} as const;

export const getTestTaskStatuses = {
  queryKey(): QueryKey {
    return ['getTestTaskStatuses'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getTestTaskStatuses(), {
      refetchInterval: 1000,
    });
  },
} as const;

export const setCardReaderTaskRunning = {
  queryKey(): QueryKey {
    return ['setCardReaderTaskRunning'];
  },
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      (running: boolean) => apiClient.setCardReaderTaskRunning({ running }),
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries(getTestTaskStatuses.queryKey());
        },
      }
    );
  },
} as const;

export const setPrinterTaskRunning = {
  queryKey(): QueryKey {
    return ['setPrinterTaskRunning'];
  },
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      (running: boolean) => apiClient.setPrinterTaskRunning({ running }),
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries(getTestTaskStatuses.queryKey());
        },
      }
    );
  },
} as const;

export const setScannerTaskRunning = {
  queryKey(): QueryKey {
    return ['setScannerTaskRunning'];
  },
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      (running: boolean) => apiClient.setScannerTaskRunning({ running }),
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries(getTestTaskStatuses.queryKey());
        },
      }
    );
  },
} as const;

export const setUsbDriveTaskRunning = {
  queryKey(): QueryKey {
    return ['setUsbDriveTaskRunning'];
  },
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      (running: boolean) => apiClient.setUsbDriveTaskRunning({ running }),
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries(getTestTaskStatuses.queryKey());
        },
      }
    );
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);

export const getLatestScannedSheet = {
  queryKey(): QueryKey {
    return ['getLatestScannedSheet'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(
      getLatestScannedSheet.queryKey(),
      () => apiClient.getLatestScannedSheet(),
      { refetchInterval: 1000 }
    );
  },
} as const;
