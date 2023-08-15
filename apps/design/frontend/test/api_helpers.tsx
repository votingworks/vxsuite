import { QueryClientProvider } from '@tanstack/react-query';
import type { Api } from '@votingworks/design-backend';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import { TestErrorBoundary } from '@votingworks/ui';
import { ApiClientContext, createQueryClient } from '../src/api';

export type MockApiClient = MockClient<Api>;

export function createMockApiClient(): MockApiClient {
  return createMockClient<Api>();
}

export function provideApi(
  apiMock: ReturnType<typeof createMockApiClient>,
  children: React.ReactNode
): JSX.Element {
  return (
    <TestErrorBoundary>
      <ApiClientContext.Provider value={apiMock}>
        <QueryClientProvider client={createQueryClient()}>
          {children}
        </QueryClientProvider>
      </ApiClientContext.Provider>
    </TestErrorBoundary>
  );
}
