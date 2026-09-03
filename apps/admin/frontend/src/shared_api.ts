import React from 'react';
import type { Api, ClientApi, RestoreApi } from '@votingworks/admin-backend';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as grout from '@votingworks/grout';
import {
  QUERY_CLIENT_DEFAULT_OPTIONS,
  createSystemCallApi,
} from '@votingworks/ui';
import { getAuthStatus, getUsbDriveStatus } from './api.js';

/**
 * Methods shared between the host (Api), client (ClientApi), and restore mode
 * (RestoreApi) backends.
 */
type SharedMethods =
  | 'getAppMode'
  | 'logOut'
  | 'getAuthStatus'
  | 'checkPin'
  | 'getUsbDriveStatus'
  | 'ejectUsbDrive'
  | 'getMachineConfig'
  | 'getMachineMode'
  | 'isMultiStationAdjudicationEnabled';

export type SharedApiClient = Pick<grout.Client<Api>, SharedMethods> &
  Pick<grout.Client<ClientApi>, SharedMethods> &
  Pick<grout.Client<RestoreApi>, SharedMethods>;

export const SharedApiClientContext = React.createContext<
  SharedApiClient | undefined
>(undefined);

export function useSharedApiClient(): SharedApiClient {
  const apiClient = React.useContext(SharedApiClientContext);
  // @coverage-exclude
  if (!apiClient) {
    throw new Error('SharedApiClientContext.Provider not found');
  }
  return apiClient;
}

// @coverage-exclude
export function createSharedQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS,
  });
}

export const systemCallApi = createSystemCallApi(
  useSharedApiClient as () => grout.Client<Api>
);

// @coverage-exclude: used in index.tsx which is excluded from coverage
export const getAppMode = {
  queryKey(): QueryKey {
    return ['getAppMode'];
  },
  useQuery() {
    const apiClient = useSharedApiClient();
    return useQuery(this.queryKey(), () => apiClient.getAppMode());
  },
} as const;

// @coverage-exclude: used in index.tsx which is excluded from coverage
export const getMachineMode = {
  queryKey(): QueryKey {
    return ['getMachineMode'];
  },
  useQuery() {
    const apiClient = useSharedApiClient();
    return useQuery(this.queryKey(), () => apiClient.getMachineMode());
  },
} as const;

export const isMultiStationAdjudicationEnabled = {
  queryKey(): QueryKey {
    return ['isMultiStationAdjudicationEnabled'];
  },
  useQuery() {
    const apiClient = useSharedApiClient();
    return useQuery(this.queryKey(), () =>
      apiClient.isMultiStationAdjudicationEnabled()
    );
  },
} as const;

export const sharedLogOut = {
  useMutation() {
    const apiClient = useSharedApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.logOut, {
      async onSuccess() {
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

export const sharedEjectUsbDrive = {
  useMutation() {
    const apiClient = useSharedApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.ejectUsbDrive, {
      // @coverage-exclude: query invalidation
      async onSuccess() {
        await queryClient.invalidateQueries(getUsbDriveStatus.queryKey());
      },
    });
  },
} as const;
