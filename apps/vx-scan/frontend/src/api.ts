/* eslint-disable vx/gts-no-import-export-type */
import type { Api } from '@votingworks/vx-scan-backend';
import React from 'react';
import * as grout from '@votingworks/grout';
import {
  DefaultOptions,
  QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

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
