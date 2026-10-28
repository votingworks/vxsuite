import React from 'react';
import * as grout from '@votingworks/grout';
import { assertDefined } from '@votingworks/basics';
import type { UnauthenticatedApi } from '@votingworks/hub-backend';
import { useQuery, type QueryKey } from '@tanstack/react-query';

export type UnauthenticatedApiClient = grout.Client<UnauthenticatedApi>;

export function createUnauthenticatedApiClient(): UnauthenticatedApiClient {
  return grout.createClient<UnauthenticatedApi>({ baseUrl: '/public/api' });
}

export const UnauthenticatedApiClientContext = React.createContext<
  UnauthenticatedApiClient | undefined
>(undefined);

export function useUnauthenticatedApiClient(): UnauthenticatedApiClient {
  const apiClient = React.useContext(UnauthenticatedApiClientContext);
  // @coverage-defer
  if (!apiClient) {
    throw new Error('UnauthenticatedApiClientContext.Provider not found');
  }
  return apiClient;
}

interface QrCodeReportInput {
  readonly payload: string;
  readonly signature: string;
  readonly certificate: string;
}

export const processQrCodeReport = {
  queryKey(input?: QrCodeReportInput): QueryKey {
    return ['processQrCodeReport', input];
  },
  useQuery(input?: QrCodeReportInput) {
    const apiClient = useUnauthenticatedApiClient();
    return useQuery(
      this.queryKey(input),
      () => apiClient.processQrCodeReport(assertDefined(input)),
      {
        enabled: input !== undefined,
        staleTime: Infinity,
        retry: false,
      }
    );
  },
} as const;
