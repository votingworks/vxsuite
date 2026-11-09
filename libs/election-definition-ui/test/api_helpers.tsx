import type React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMockClient,
  type MockClient,
} from '@votingworks/grout-test-utils';
import {
  QUERY_CLIENT_DEFAULT_OPTIONS,
  TestErrorBoundary,
} from '@votingworks/ui';
import {
  createElectionDefinitionApi,
  type ElectionDefinitionApi,
  type ElectionDefinitionApiOptions,
} from '../src/api.js';
import { ElectionDefinitionContextProvider } from '../src/election_definition_context.js';

export type MockApiClient = MockClient<ElectionDefinitionApi>;

export function createMockApiClient(): MockApiClient {
  return createMockClient<ElectionDefinitionApi>();
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS });
}

export function provideApi(
  apiMock: MockApiClient,
  children: React.ReactNode,
  {
    queryClient = createTestQueryClient(),
    options,
  }: {
    queryClient?: QueryClient;
    options?: ElectionDefinitionApiOptions;
  } = {}
): JSX.Element {
  return (
    <TestErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ElectionDefinitionContextProvider
          api={createElectionDefinitionApi(() => apiMock, options)}
        >
          {children}
        </ElectionDefinitionContextProvider>
      </QueryClientProvider>
    </TestErrorBoundary>
  );
}
