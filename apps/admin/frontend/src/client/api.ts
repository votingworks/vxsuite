import React from 'react';
import { deepEqual } from '@votingworks/basics';
import type { ClientApi } from '@votingworks/admin-backend';
import {
  NETWORKED_QUERY_CLIENT_DEFAULT_OPTIONS,
  USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
  createSystemCallApi,
} from '@votingworks/ui';
import {
  QueryClient,
  QueryKey,
  UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as grout from '@votingworks/grout';
import { DEFAULT_QUERY_REFETCH_INTERVAL } from '../utils/globals.js';

export type ApiClient = grout.Client<ClientApi>;

type QueryOutput<Method extends keyof ApiClient> = Awaited<
  ReturnType<ApiClient[Method]>
>;

/* istanbul ignore next - creates real API client */
export function createApiClient(): ApiClient {
  return grout.createClient<ClientApi>({ baseUrl: '/api' });
}

export const ApiClientContext = React.createContext<ApiClient | undefined>(
  undefined
);

export function useApiClient(): ApiClient {
  const apiClient = React.useContext(ApiClientContext);
  /* istanbul ignore next */
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
  /**
   * `ClientAppRoot` (which is always mounted) is the only component that
   * should pass a `refetchInterval`. react-query runs a separate refetch
   * timer for every observer that sets one, so a second polling component
   * would multiply the request rate to the backend. Everything else should
   * subscribe with `useQuery()` and receive updates through the shared query
   * cache.
   */
  useQuery(
    options?: UseQueryOptions<QueryOutput<'getNetworkConnectionStatus'>>
  ) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getNetworkConnectionStatus(),
      options
    );
  },
} as const;

export const getAdjudicationSessionStatus = {
  queryKey(): QueryKey {
    return ['getAdjudicationSessionStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getAdjudicationSessionStatus(),
      { refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL }
    );
  },
} as const;

export const getSystemSettings = {
  queryKey(): QueryKey {
    return ['getSystemSettings'];
  },
  /**
   * `SessionTimeLimitTracker` (which is always mounted) is the only component
   * that should pass a `refetchInterval`. react-query runs a separate refetch
   * timer for every observer that sets one, so a second polling component
   * would multiply the request rate to the backend. Everything else should
   * subscribe with `useQuery()` and receive updates through the shared query
   * cache.
   */
  useQuery(options: UseQueryOptions<QueryOutput<'getSystemSettings'>> = {}) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getSystemSettings(), {
      staleTime: 0,
      ...options,
    });
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
  /**
   * `ClientAppRoot` (which is always mounted) is the only component that
   * should pass a `refetchInterval`. react-query runs a separate refetch
   * timer for every observer that sets one, so a second polling component
   * would multiply the request rate to the backend. Everything else should
   * subscribe with `useQuery()` and receive updates through the shared query
   * cache.
   */
  useQuery(options: UseQueryOptions<QueryOutput<'getAuthStatus'>> = {}) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getAuthStatus(), {
      structuralSharing(oldData, newData) {
        if (!oldData) {
          return newData;
        }

        // Prevent infinite re-renders of the app tree:
        const isUnchanged = deepEqual(oldData, newData);
        return isUnchanged ? oldData : newData;
      },
      ...options,
    });
  },
} as const;

export const checkPin = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.checkPin, {
      /* istanbul ignore start - query invalidation */
      async onSuccess() {
        await queryClient.invalidateQueries(getAuthStatus.queryKey());
      },
      /* istanbul ignore stop */
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
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getCurrentElectionMetadata(),
      { refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL }
    );
  },
} as const;

// USB

export const getUsbDriveStatus = {
  queryKey(): QueryKey {
    return ['getUsbDriveStatus'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getUsbDriveStatus(), {
      refetchInterval: USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
      structuralSharing(oldData, newData) {
        if (!oldData) {
          return newData;
        }
        const isUnchanged = deepEqual(oldData, newData);
        return isUnchanged ? oldData : newData;
      },
    });
  },
} as const;

export const ejectUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.ejectUsbDrive, {
      /* istanbul ignore start - tested via shared UI components */
      async onSuccess() {
        await queryClient.invalidateQueries(getUsbDriveStatus.queryKey());
      },
      /* istanbul ignore stop */
    });
  },
} as const;

export const formatUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.formatUsbDrive, {
      /* istanbul ignore start - tested via shared UI components */
      async onSuccess() {
        await queryClient.invalidateQueries(getUsbDriveStatus.queryKey());
      },
      /* istanbul ignore stop */
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
  useQuery(contestIds: string[]) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(contestIds),
      () => apiClient.getWriteInCandidates({ contestIds }),
      { staleTime: 0, refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL }
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
