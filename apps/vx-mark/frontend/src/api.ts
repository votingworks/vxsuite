/* eslint-disable vx/gts-no-import-export-type */
import type { Api } from '@votingworks/vx-mark-backend';
import React from 'react';
import * as grout from '@votingworks/grout';
import { DefaultOptions, QueryKey, useQuery } from '@tanstack/react-query';

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
    // If the server is unreachable or an unexpected error occurs, don't retry.
    retry: false,

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

    // If a query fails with an unexpected error, throw it during the render
    // phase so it will propagate up to the nearest error boundary (we have a
    // fallback global error boundary).
    useErrorBoundary: true,
  },
  mutations: { retry: false, networkMode: 'always', useErrorBoundary: true },
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
