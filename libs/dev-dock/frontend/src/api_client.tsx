import * as grout from '@votingworks/grout';
import type { Api } from '@votingworks/dev-dock-backend';
import React from 'react';

export type ApiClient = grout.Client<Api>;

export const ApiClientContext = React.createContext<ApiClient | undefined>(
  undefined
);

export function useApiClient(): ApiClient {
  const apiClient = React.useContext(ApiClientContext);
  // istanbul ignore next
  if (!apiClient) {
    throw new Error('ApiClientContext.Provider not found');
  }
  return apiClient;
}
