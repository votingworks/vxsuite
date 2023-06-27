import React from 'react';
import type { Api } from '@votingworks/central-scan-backend';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  QUERY_CLIENT_DEFAULT_OPTIONS,
} from '@votingworks/ui';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as grout from '@votingworks/grout';

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

export const getElectionDefinition = {
  queryKey(): QueryKey {
    return ['getElectionDefinition'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getElectionDefinition());
  },
} as const;

export const getMarkThresholdOverrides = {
  queryKey(): QueryKey {
    return ['getMarkThresholdOverrides'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.getMarkThresholdOverrides()
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

export const deleteBatch = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.deleteBatch);
  },
} as const;

export const configureFromBallotPackageOnUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.configureFromBallotPackageOnUsbDrive, {
      async onSuccess() {
        await queryClient.invalidateQueries(getSystemSettings.queryKey());
        await queryClient.invalidateQueries(getElectionDefinition.queryKey());
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
        await queryClient.invalidateQueries(getTestMode.queryKey());
        await queryClient.invalidateQueries(getSystemSettings.queryKey());
        await queryClient.invalidateQueries(getElectionDefinition.queryKey());
      },
    });
  },
} as const;

export const zeroScanningData = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.zeroScanningData);
  },
} as const;

export const setMarkThresholdOverrides = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setMarkThresholdOverrides, {
      async onSuccess() {
        await queryClient.invalidateQueries(
          getMarkThresholdOverrides.queryKey()
        );
      },
    });
  },
} as const;
