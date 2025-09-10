import React from 'react';
import * as grout from '@votingworks/grout';
import type { UnauthenticatedApi } from '@votingworks/design-backend';
import { useMutation } from '@tanstack/react-query';

export type UnauthenticatedApiClient = grout.Client<UnauthenticatedApi>;

export function createUnauthenticatedApiClient(): UnauthenticatedApiClient {
  return grout.createClient<UnauthenticatedApi>({ baseUrl: '/public/api' });
}

export const UnauthenticatedApiClientContext = React.createContext<
  UnauthenticatedApiClient | undefined
>(undefined);

export function useUnauthenticatedApiClient(): UnauthenticatedApiClient {
  const apiClient = React.useContext(UnauthenticatedApiClientContext);
  if (!apiClient) {
    throw new Error('UnauthenticatedApiClientContext.Provider not found');
  }
  return apiClient;
}

export const processQrCodeReport = {
  useMutation() {
    const apiClient = useUnauthenticatedApiClient();
    return useMutation(apiClient.processQrCodeReport);
  },
} as const;
