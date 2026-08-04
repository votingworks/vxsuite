import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import type { Api } from '@votingworks/print-backend';
import { ApiClientContext, createQueryClient } from '../src/api.js';

export type ApiMock = MockClient<Api>;

export function createApiMock(): ApiMock {
  return createMockClient<Api>();
}

export function ApiMockProvider({
  apiMock,
  queryClient = createQueryClient(),
  children,
}: {
  apiMock: ApiMock;
  queryClient?: QueryClient;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <ApiClientContext.Provider value={apiMock}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiClientContext.Provider>
  );
}
