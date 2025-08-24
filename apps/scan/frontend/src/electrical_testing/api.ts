import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as grout from '@votingworks/grout';
import type { HWTA } from '@votingworks/scan-backend';
import {
  createSystemCallApi,
  QUERY_CLIENT_DEFAULT_OPTIONS,
} from '@votingworks/ui';
import React, { useEffect, useState } from 'react';

const baseUrl = '/api';

export type ApiClient = grout.Client<HWTA.Api>;

export function createApiClient(): ApiClient {
  return grout.createClient<HWTA.Api>({ baseUrl });
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
    return useQuery(this.queryKey(), () =>
      apiClient.getElectricalTestingStatuses()
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
          await queryClient.invalidateQueries(
            getElectricalTestingStatuses.queryKey()
          );
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
          await queryClient.invalidateQueries(
            getElectricalTestingStatuses.queryKey()
          );
        },
      }
    );
  },
} as const;

export const setScannerTaskMode = {
  queryKey(): QueryKey {
    return ['setScannerTaskMode'];
  },
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(
      (mode: HWTA.ScanningMode) => apiClient.setScannerTaskMode({ mode }),
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

export const resetLastPrintedAt = {
  queryKey(): QueryKey {
    return ['resetLastPrintedAt'];
  },
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(() => apiClient.resetLastPrintedAt(), {
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          getElectricalTestingStatuses.queryKey()
        );
      },
    });
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

export const systemCallApi = createSystemCallApi(useApiClient);

export const getCurrentScanningSessionData = {
  queryKey(): QueryKey {
    return ['getCurrentScanningSessionData'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(getCurrentScanningSessionData.queryKey(), () =>
      apiClient.getCurrentScanningSessionData()
    );
  },
} as const;

export const resetScanningSession = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(() => apiClient.resetScanningSession());
  },
} as const;

export const playSound = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.playSound);
  },
} as const;

export function useApiEvents(): void {
  const queryClient = useQueryClient();
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const websocket = new WebSocket(`${baseUrl}/events`);

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (
        websocket.readyState === WebSocket.CLOSING ||
        websocket.readyState === WebSocket.CLOSED
      ) {
        setRetry((prev) => prev + 1);
      }
    };

    websocket.onmessage = (event) => {
      let parsed: any;
      try {
        parsed = grout.deserialize(event.data);
      } catch (e) {
        console.warn(
          'Ignoring invalid data from websocket:',
          event.data,
          'Error:',
          e
        );
        return;
      }

      switch (parsed.type) {
        case 'status-messages-changed': {
          queryClient.setQueryData(
            getElectricalTestingStatuses.queryKey(),
            parsed.payload
          );
          break;
        }

        case 'scanning-session-changed': {
          queryClient.setQueryData(
            getCurrentScanningSessionData.queryKey(),
            parsed.payload
          );
          break;
        }

        default: {
          console.warn('Ignoring unexpected payload type:', parsed.type);
          break;
        }
      }
    };

    return () => {
      websocket.close();
    };
  }, [retry]);
}
