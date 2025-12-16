/* istanbul ignore file - @preserve */
import type { ElectricalTestingApi } from '@votingworks/mark-backend';
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

export const getPrinterStatus = {
  queryKey(): QueryKey {
    return ['getPrinterStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getPrinterStatus(), {
      refetchInterval: 1000,
    });
  },
} as const;

export const getPrinterTaskStatus = {
  queryKey(): QueryKey {
    return ['getPrinterTaskStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getPrinterTaskStatus(), {
      refetchInterval: 1000,
    });
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
          await queryClient.invalidateQueries(getPrinterTaskStatus.queryKey());
        },
      }
    );
  },
} as const;

export const printTestPage = {
  queryKey(): QueryKey {
    return ['printTestPage'];
  },
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(() => apiClient.printTestPage(), {
      onSuccess: async () => {
        await queryClient.invalidateQueries(getPrinterStatus.queryKey());
      },
    });
  },
} as const;

export const getBarcodeStatus = {
  queryKey(): QueryKey {
    return ['getBarcodeStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getBarcodeStatus(), {
      refetchInterval: 1000,
    });
  },
} as const;

export const playSpeakerSound = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(
      (name: 'alarm' | 'chime' | 'error' | 'success' | 'warning') =>
        apiClient.playSpeakerSound({ name })
    );
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);
