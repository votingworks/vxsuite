import React from 'react';
import type { Api, ClientApi } from '@votingworks/admin-backend';
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
import { getAuthStatus, getUsbDriveStatus } from './api';

/**
 * Methods shared between host (Api) and client (ClientApi) backends.
 */
type SharedMethods =
  | 'logOut'
  | 'getAuthStatus'
  | 'checkPin'
  | 'getUsbDriveStatus'
  | 'ejectUsbDrive'
  | 'getMachineConfig'
  | 'getMachineMode';

export type SharedApiClient = Pick<grout.Client<Api>, SharedMethods> &
  Pick<grout.Client<ClientApi>, SharedMethods>;

export const SharedApiClientContext = React.createContext<
  SharedApiClient | undefined
>(undefined);

export function useSharedApiClient(): SharedApiClient {
  const apiClient = React.useContext(SharedApiClientContext);
  /* istanbul ignore next @preserve */
  if (!apiClient) {
    throw new Error('SharedApiClientContext.Provider not found');
  }
  return apiClient;
}

/* istanbul ignore next */
export function createSharedQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS,
  });
}

export const systemCallApi = createSystemCallApi(
  useSharedApiClient as () => grout.Client<Api>
);

/* istanbul ignore next - used in index.tsx which is excluded from coverage @preserve */
export const getMachineMode = {
  queryKey(): QueryKey {
    return ['getMachineMode'];
  },
  useQuery() {
    const apiClient = useSharedApiClient();
    return useQuery(this.queryKey(), () => apiClient.getMachineMode());
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
      /* istanbul ignore next - query invalidation @preserve */
      async onSuccess() {
        await queryClient.invalidateQueries(getUsbDriveStatus.queryKey());
      },
    });
  },
} as const;
