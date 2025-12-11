import type { ElectricalTestingApi } from '@votingworks/mark-scan-backend';
import React from 'react';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as grout from '@votingworks/grout';
import {
  createSystemCallApi,
  QUERY_CLIENT_DEFAULT_OPTIONS,
} from '@votingworks/ui';

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
    return ['getElectricalTestingStatusMessages'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getElectricalTestingStatuses(),
      { refetchInterval: 1000 }
    );
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
          await queryClient.invalidateQueries(
            getElectricalTestingStatuses.queryKey()
          );
        },
      }
    );
  },
} as const;

export const setPaperHandlerTaskRunning = {
  queryKey(): QueryKey {
    return ['setPaperHandlerTaskRunning'];
  },
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      (running: boolean) => apiClient.setPaperHandlerTaskRunning({ running }),
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries(
            getElectricalTestingStatuses.queryKey()
          );
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
          await queryClient.invalidateQueries(
            getElectricalTestingStatuses.queryKey()
          );
        },
      }
    );
  },
} as const;

export const getCpuMetrics = {
  queryKey(): QueryKey {
    return ['getCpuMetrics'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getCpuMetrics(), {
      refetchInterval: 1000,
    });
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);

export const generateSignedHashValidationQrCodeValue = {
  queryKey(): QueryKey {
    return ['generateSignedHashValidationQrCodeValue'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.generateSignedHashValidationQrCodeValue(),
      { cacheTime: 0 }
    );
  },
} as const;
