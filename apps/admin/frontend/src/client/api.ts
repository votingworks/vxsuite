import React from 'react';
import { deepEqual } from '@votingworks/basics';
import type { ClientApi } from '@votingworks/admin-backend';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  NETWORKED_QUERY_CLIENT_DEFAULT_OPTIONS,
  USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
  createSystemCallApi,
  usePollingQuery,
} from '@votingworks/ui';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as grout from '@votingworks/grout';
import { DEFAULT_QUERY_REFETCH_INTERVAL } from '../utils/globals.js';

export type ApiClient = grout.Client<ClientApi>;

// @coverage-exclude: creates real API client
export function createApiClient(): ApiClient {
  return grout.createClient<ClientApi>({ baseUrl: '/api' });
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
  return new QueryClient({
    defaultOptions: NETWORKED_QUERY_CLIENT_DEFAULT_OPTIONS,
  });
}

// Machine config

export const getMachineConfig = {
  queryKey(): QueryKey {
    return ['getMachineConfig'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getMachineConfig());
  },
} as const;

export const getNetworkConnectionStatus = {
  queryKey(): QueryKey {
    return ['getNetworkConnectionStatus'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getNetworkConnectionStatus(),
      DEFAULT_QUERY_REFETCH_INTERVAL
    );
  },
} as const;

export const getAdjudicationSessionStatus = {
  queryKey(): QueryKey {
    return ['getAdjudicationSessionStatus'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getAdjudicationSessionStatus(),
      DEFAULT_QUERY_REFETCH_INTERVAL
    );
  },
} as const;

export const getSystemSettings = {
  queryKey(): QueryKey {
    return ['getSystemSettings'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getSystemSettings(),
      DEFAULT_QUERY_REFETCH_INTERVAL,
      { staleTime: 0 }
    );
  },
} as const;

export const setMachineMode = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.setMachineMode);
  },
} as const;

// Auth

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

          // Prevent infinite re-renders of the app tree:
          const isUnchanged = deepEqual(oldData, newData);
          return isUnchanged ? oldData : newData;
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
      // @coverage-defer
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
      // @coverage-defer
      async onSuccess() {
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
    });
  },
} as const;

// Election
export const getCurrentElectionMetadata = {
  queryKey(): QueryKey {
    return ['getCurrentElectionMetadata'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getCurrentElectionMetadata(),
      DEFAULT_QUERY_REFETCH_INTERVAL
    );
  },
} as const;

// USB

export const getUsbDriveStatus = {
  queryKey(): QueryKey {
    return ['getUsbDriveStatus'];
  },
  usePollingQuery() {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(),
      () => apiClient.getUsbDriveStatus(),
      USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
      {
        structuralSharing(oldData, newData) {
          if (!oldData) {
            return newData;
          }
          const isUnchanged = deepEqual(oldData, newData);
          // @coverage-defer
          return isUnchanged ? oldData : newData;
        },
      }
    );
  },
} as const;

export const ejectUsbDrive = {
  // @coverage-defer
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.ejectUsbDrive, {
      // @coverage-exclude: tested via shared UI components
      async onSuccess() {
        await queryClient.invalidateQueries(getUsbDriveStatus.queryKey());
      },
    });
  },
} as const;

export const formatUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.formatUsbDrive, {
      // @coverage-exclude: tested via shared UI components
      async onSuccess() {
        await queryClient.invalidateQueries(getUsbDriveStatus.queryKey());
      },
    });
  },
} as const;

// Adjudication proxy

export const claimAndLoadBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.claimAndLoadBallot);
  },
} as const;

export const releaseBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.releaseBallot);
  },
} as const;

export const getBallotImages = {
  queryKey(cvrId: string): QueryKey {
    return ['getBallotImages', cvrId];
  },
  useQuery(cvrId: string) {
    const apiClient = useApiClient();
    // keepPreviousData holds the previous ballot's images (isSuccess stays
    // true) while the next ballot's images load, so paging via Skip/Accept
    // doesn't flash the full-screen Loading state between ballots.
    return useQuery(
      this.queryKey(cvrId),
      () => apiClient.getBallotImages({ cvrId }),
      { keepPreviousData: true }
    );
  },
} as const;

export const getWriteInCandidates = {
  queryKey(contestIds: string[]): QueryKey {
    return ['getWriteInCandidates', contestIds];
  },
  usePollingQuery(contestIds: string[]) {
    const apiClient = useApiClient();
    return usePollingQuery(
      this.queryKey(contestIds),
      () => apiClient.getWriteInCandidates({ contestIds }),
      DEFAULT_QUERY_REFETCH_INTERVAL,
      { staleTime: 0 }
    );
  },
} as const;

export const adjudicateCvr = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.adjudicateCvr, {
      async onSuccess() {
        await Promise.all([
          queryClient.invalidateQueries(['getWriteInCandidates']),
        ]);
      },
    });
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);
