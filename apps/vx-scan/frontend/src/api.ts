/* eslint-disable vx/gts-no-import-export-type */
import type { Api, PrecinctScannerStatus } from '@votingworks/vx-scan-backend';
import React from 'react';
import * as grout from '@votingworks/grout';
import {
  DefaultOptions,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from '@tanstack/react-query';
import { CastVoteRecord } from '@votingworks/types';

export const ApiClientContext = React.createContext<
  grout.Client<Api> | undefined
>(undefined);

export function useApiClient(): grout.Client<Api> {
  const apiClient = React.useContext(ApiClientContext);
  if (!apiClient) {
    throw new Error('ApiClientContext.Provider not found');
  }
  return apiClient;
}

export const queryClientDefaultOptions: DefaultOptions = {
  queries: {
    // Since our backend is always local, we don't want react-query to "pause"
    // when it can't detect a network connection.
    networkMode: 'always',

    // Never mark cached data as stale automatically. This will prevent
    // automatic refetching of data (e.g. upon navigating to a page). Cached
    // queries will only be refecthed when we explicitly invalidate the query
    // after a mutation. This is an appropriate strategy in VxSuite since
    // there is only ever one frontend client updating the backend, so we
    // don't expect data to change on the backend except when we mutate it.
    staleTime: Infinity,
  },
  mutations: { networkMode: 'always' },
};

export const getMachineConfig = {
  queryKey(): QueryKey {
    return ['getMachineConfig'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getMachineConfig());
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
