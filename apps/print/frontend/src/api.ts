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
  createSystemCallApi,
  QUERY_CLIENT_DEFAULT_OPTIONS,
  USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
} from '@votingworks/ui';
import { PrecinctId } from '@votingworks/types';

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

export const getElectionRecord = {
  queryKey(): QueryKey {
    return ['getElectionRecord'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getElectionRecord());
  },
} as const;

export const configureElectionPackageFromUsb = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(() => apiClient.configureElectionPackageFromUsb(), {
      async onSuccess() {
        await queryClient.invalidateQueries(getElectionRecord.queryKey());
      },
    });
  },
} as const;

export const getPrecinctSelection = {
  queryKey(): QueryKey {
    return ['getPrecinctSelection'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getPrecinctSelection());
  },
} as const;

export const setPrecinctSelection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setPrecinctSelection, {
      async onSuccess() {
        await queryClient.invalidateQueries(getPrecinctSelection.queryKey());
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

export const getBallotPrintCounts = {
  queryKey(precinctId?: PrecinctId): QueryKey {
    return ['getBallotPrintCounts', precinctId];
  },
  useQuery(precinctId?: PrecinctId) {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(precinctId), () =>
      apiClient.getBallotPrintCounts({ precinctId })
    );
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
    const queryClient = useQueryClient();
    return useMutation(apiClient.printBallot, {
      async onSuccess() {
        await queryClient.invalidateQueries(getBallotPrintCounts.queryKey());
      },
    });
  },
} as const;

export const unconfigureMachine = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.unconfigureMachine, {
      async onSuccess() {
        await queryClient.invalidateQueries(getPrecinctSelection.queryKey());
        await queryClient.invalidateQueries(getElectionRecord.queryKey());
      },
    });
  },
} as const;

export const getMachineConfig = {
  queryKeyPrefix: 'getMachineConfig',
  queryKey(): QueryKey {
    return [this.queryKeyPrefix];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getMachineConfig());
  },
} as const;

export const getDeviceStatuses = {
  queryKey(): QueryKey {
    return ['getDeviceStatuses'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getDeviceStatuses(), {
      refetchInterval: USB_DRIVE_STATUS_POLLING_INTERVAL_MS,
    });
  },
} as const;

export const printBallotsPrintedReport = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.printBallotsPrintedReport);
  },
} as const;

export const exportBallotsPrintedReportPdf = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportBallotsPrintedReportPdf);
  },
} as const;

export const systemCallApi = createSystemCallApi(useApiClient);
