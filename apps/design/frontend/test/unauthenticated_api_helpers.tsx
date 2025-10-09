import React from 'react';
import type { UnauthenticatedApi } from '@votingworks/design-backend';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import { AppBase, TestErrorBoundary } from '@votingworks/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { UnauthenticatedApiClientContext } from '../src/public_api';
import { createQueryClient } from '../src/api';

export type MockUnauthenticatedApiClient = MockClient<UnauthenticatedApi>;

export function createMockUnauthenticatedApiClient(): MockUnauthenticatedApiClient {
  return createMockClient<UnauthenticatedApi>();
}

export function provideUnauthenticatedApi(
  apiMock: ReturnType<typeof createMockUnauthenticatedApiClient>,
  children: React.ReactNode
): JSX.Element {
  return (
    <AppBase
      defaultColorMode="desktop"
      defaultSizeMode="desktop"
      showScrollBars
    >
      <TestErrorBoundary>
        <UnauthenticatedApiClientContext.Provider value={apiMock}>
          <QueryClientProvider client={createQueryClient()}>
            {children}
          </QueryClientProvider>
        </UnauthenticatedApiClientContext.Provider>
      </TestErrorBoundary>
    </AppBase>
  );
}
