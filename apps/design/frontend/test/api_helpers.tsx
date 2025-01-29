import { QueryClientProvider } from '@tanstack/react-query';
import type { Api } from '@votingworks/design-backend';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import { ElectionId } from '@votingworks/types';
import { TestErrorBoundary } from '@votingworks/ui';
import { ApiClientContext, createQueryClient } from '../src/api';
import { FeaturesProvider } from '../src/features_context';

export type MockApiClient = MockClient<Api>;

export function createMockApiClient(): MockApiClient {
  return createMockClient<Api>();
}

export function provideApi(
  apiMock: ReturnType<typeof createMockApiClient>,
  children: React.ReactNode,
  electionId?: ElectionId
): JSX.Element {
  return (
    <TestErrorBoundary>
      <ApiClientContext.Provider value={apiMock}>
        <QueryClientProvider client={createQueryClient()}>
          <FeaturesProvider electionId={electionId}>
            {children}
          </FeaturesProvider>
        </QueryClientProvider>
      </ApiClientContext.Provider>
    </TestErrorBoundary>
  );
}
