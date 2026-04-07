import React from 'react';
import { deepEqual } from '@votingworks/basics';
import type { ClientApi } from '@votingworks/admin-backend';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  NETWORKED_QUERY_CLIENT_DEFAULT_OPTIONS,
  USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
  createSystemCallApi,
} from '@votingworks/ui';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as grout from '@votingworks/grout';
import { DEFAULT_QUERY_REFETCH_INTERVAL } from '../utils/globals';

export type ApiClient = grout.Client<ClientApi>;

/* istanbul ignore next - creates real API client @preserve */
export function createApiClient(): ApiClient {
  return grout.createClient<ClientApi>({ baseUrl: '/api' });
}

export const ApiClientContext = React.createContext<ApiClient | undefined>(
  undefined
);

export function useApiClient(): ApiClient {
  const apiClient = React.useContext(ApiClientContext);
  /* istanbul ignore next @preserve */
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
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getNetworkConnectionStatus(),
      { refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL }
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
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getSystemSettings());
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
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getAuthStatus(), {
      refetchInterval: AUTH_STATUS_POLLING_INTERVAL_MS,
      structuralSharing(oldData, newData) {
        if (!oldData) {
          return newData;
        }

        // Prevent infinite re-renders of the app tree:
        const isUnchanged = deepEqual(oldData, newData);
        return isUnchanged ? oldData : newData;
      },
    });
  },
} as const;

export const checkPin = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.checkPin, {
      /* istanbul ignore next - query invalidation @preserve */
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
      async onSuccess() {
        await queryClient.invalidateQueries(getUsbDriveStatus.queryKey());
      },
    });
  },
} as const;

// Adjudication proxy

export const claimBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.claimBallot);
  },
} as const;

export const releaseBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.releaseBallot);
  },
} as const;

export const getBallotAdjudicationData = {
  queryKey(cvrId: string): QueryKey {
    return ['getBallotAdjudicationData', cvrId];
  },
  useQuery(cvrId: string) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(cvrId), () =>
      apiClient.getBallotAdjudicationData({ cvrId })
    );
  },
} as const;

export const getBallotImages = {
  queryKey(cvrId: string): QueryKey {
    return ['getBallotImages', cvrId];
  },
  useQuery(cvrId: string) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(cvrId), () =>
      apiClient.getBallotImages({ cvrId })
    );
  },
} as const;

export const getMarginalMarks = {
  queryKey(cvrId: string, contestId: string): QueryKey {
    return ['getMarginalMarks', cvrId, contestId];
  },
  useQuery(cvrId: string, contestId: string) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(cvrId, contestId), () =>
      apiClient.getMarginalMarks({ cvrId, contestId })
    );
  },
} as const;

export const getWriteInCandidates = {
  queryKey(contestId?: string): QueryKey {
    return ['getWriteInCandidates', contestId];
  },
  useQuery(contestId?: string) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(contestId), () =>
      apiClient.getWriteInCandidates({ contestId })
    );
  },
} as const;

export const adjudicateCvrContest = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.adjudicateCvrContest);
  },
} as const;

export const resolveBallotTags = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.resolveBallotTags);
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);
