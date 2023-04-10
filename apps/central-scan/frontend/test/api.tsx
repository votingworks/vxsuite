import React from 'react';
import type { Api } from '@votingworks/central-scan-backend'; // eslint-disable-line vx/gts-no-import-export-type
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import { DippedSmartCardAuth } from '@votingworks/types';
import { QueryClientProvider } from '@tanstack/react-query';
import { ApiClientContext, createQueryClient } from '../src/api';

export type MockApiClient = MockClient<Api>;

export function createMockApiClient(): MockApiClient {
  return createMockClient<Api>();
}

export function setAuthStatus(
  mockApiClient: MockApiClient,
  authStatus: DippedSmartCardAuth.AuthStatus
): void {
  mockApiClient.getAuthStatus.expectRepeatedCallsWith().resolves(authStatus);
}

export function provideApi(
  apiMock: ReturnType<typeof createMockApiClient>,
  children: React.ReactNode
): JSX.Element {
  return (
    <ApiClientContext.Provider value={apiMock}>
      <QueryClientProvider client={createQueryClient()}>
        {children}
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}
