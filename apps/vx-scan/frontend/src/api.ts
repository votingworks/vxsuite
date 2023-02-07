/* eslint-disable-next-line vx/gts-no-import-export-type */
import type {
  Api,
  CardDataSchemaName,
  PrecinctScannerStatus,
} from '@votingworks/vx-scan-backend';
import React from 'react';
import * as grout from '@votingworks/grout';
import {
  QueryClient,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from '@tanstack/react-query';
import { CastVoteRecord } from '@votingworks/types';
import {
  AUTH_STATUS_POLLING_INTERVAL_MS,
  QUERY_CLIENT_DEFAULT_OPTIONS,
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

export const getMachineConfig = {
  queryKey(): QueryKey {
    return ['getMachineConfig'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getMachineConfig());
  },
} as const;

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

export const readCardData = {
  queryKey(): QueryKey {
    return ['readCardData'];
  },
  useQuery<T>(schema: CardDataSchemaName) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () =>
        // In the conversion from the Api type to the ApiClient type, generics are lost, so we cast
        // back to the original type here
        (apiClient.readCardData as Api['readCardData'])<T>({ schema }),
      {
        // Don't cache this data because so many actions can invalidate it, e.g. not just writing
        // card data but also card removal
        staleTime: 0,
      }
    );
  },
} as const;

export const writeCardData = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.writeCardData, {
      async onSuccess() {
        // Because we immediately consider retrieved card data stale, this invalidation isn't
        // strictly necessary
        await queryClient.invalidateQueries(readCardData.queryKey());
      },
    });
  },
} as const;

export const getConfig = {
  queryKey(): QueryKey {
    return ['getConfig'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getConfig());
  },
} as const;

export const configureFromBallotPackageOnUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.configureFromBallotPackageOnUsbDrive, {
      async onSuccess() {
        await queryClient.invalidateQueries(getConfig.queryKey());
      },
    });
  },
} as const;

export const unconfigureElection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.unconfigureElection, {
      async onSuccess() {
        await queryClient.invalidateQueries(getConfig.queryKey());
      },
    });
  },
} as const;

export const setPrecinctSelection = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setPrecinctSelection, {
      async onSuccess() {
        await queryClient.invalidateQueries(getConfig.queryKey());
      },
    });
  },
} as const;

export const setMarkThresholdOverrides = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setMarkThresholdOverrides, {
      async onSuccess() {
        await queryClient.invalidateQueries(getConfig.queryKey());
      },
    });
  },
} as const;

export const setIsSoundMuted = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setIsSoundMuted, {
      async onSuccess() {
        await queryClient.invalidateQueries(getConfig.queryKey());
      },
    });
  },
} as const;

export const setTestMode = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setTestMode, {
      async onSuccess() {
        await queryClient.invalidateQueries(getConfig.queryKey());
      },
    });
  },
} as const;

export const setPollsState = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.setPollsState, {
      async onSuccess() {
        await queryClient.invalidateQueries(getConfig.queryKey());
      },
    });
  },
} as const;

export const recordBallotBagReplaced = {
  useMutation() {
    const apiClient = useApiClient();
    const queryClient = useQueryClient();
    return useMutation(apiClient.recordBallotBagReplaced, {
      async onSuccess() {
        await queryClient.invalidateQueries(getConfig.queryKey());
      },
    });
  },
} as const;

export const backupToUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.backupToUsbDrive);
  },
} as const;

export const exportCastVoteRecordsToUsbDrive = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.exportCastVoteRecordsToUsbDrive);
  },
} as const;

export const getCastVoteRecordsForTally = {
  queryKey(): QueryKey {
    return ['getCastVoteRecordsForTally'];
  },
  useQuery(options: UseQueryOptions<CastVoteRecord[]> = {}) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getCastVoteRecordsForTally(),
      // For now, just invalidate this query immediately so it's always reloaded.
      // TODO figure out what mutations should invalidate this query.
      { ...options, staleTime: 0 }
    );
  },
} as const;

export const getScannerStatus = {
  queryKey(): QueryKey {
    return ['getScannerStatus'];
  },
  useQuery(options?: UseQueryOptions<PrecinctScannerStatus>) {
    const apiClient = useApiClient();
    return useQuery(
      this.queryKey(),
      () => apiClient.getScannerStatus(),
      options
    );
  },
} as const;

export const scanBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.scanBallot);
  },
} as const;

export const acceptBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.acceptBallot);
  },
} as const;

export const returnBallot = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.returnBallot);
  },
} as const;

export const calibrate = {
  useMutation() {
    const apiClient = useApiClient();
    return useMutation(apiClient.calibrate);
  },
} as const;
