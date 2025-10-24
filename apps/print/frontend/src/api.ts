import type { Api } from '@votingworks/print-backend';
import React from 'react';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  QUERY_CLIENT_DEFAULT_OPTIONS,
  USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
} from '@votingworks/ui';

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

export const getElectionDefinition = {
  queryKey(): QueryKey {
    return ['getElectionDefinition'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getElectionDefinition(), {
      refetchInterval: 100,
    });
  },
} as const;

export const getUsbDriveStatus = {
  queryKey(): QueryKey {
    return ['getUsbDriveStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getUsbDriveStatus(), {
      refetchInterval: USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const configureElectionPackageFromUsb = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(() => apiClient.configureElectionPackageFromUsb(), {
      async onSuccess() {
        await queryClient.invalidateQueries(getElectionDefinition.queryKey());
      },
    });
  },
} as const;

export const getBallots = {
  queryKey(): QueryKey {
    return ['getBallots'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getBallots());
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

export const printBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.printBallot, {});
  },
} as const;

export const unconfigureMachine = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.unconfigureMachine, {});
  },
} as const;
