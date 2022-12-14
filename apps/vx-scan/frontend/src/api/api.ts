/* eslint-disable vx/gts-no-import-export-type */
import type { Api } from '@votingworks/vx-scan-backend';
import React from 'react';
import * as grout from '@votingworks/grout';

const baseUrl = '/api';

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
