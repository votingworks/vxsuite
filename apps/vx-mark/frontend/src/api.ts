/* eslint-disable vx/gts-no-import-export-type */
import type { Api } from '@votingworks/vx-mark-backend';
import React from 'react';
import * as grout from '@votingworks/grout';
import { QueryKey, useQuery } from '@tanstack/react-query';

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

export const getMachineConfig = {
  queryKey(): QueryKey {
    return ['getMachineConfig'];
  },
  useQuery() {
    const apiClient = useApiClient();
    return useQuery(this.queryKey(), () => apiClient.getMachineConfig());
  },
} as const;
