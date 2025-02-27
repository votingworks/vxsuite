import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Api, User } from '@votingworks/design-backend';
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
  electionId?: ElectionId,
  queryClient: QueryClient = createQueryClient()
): JSX.Element {
  return (
    <TestErrorBoundary>
      <ApiClientContext.Provider value={apiMock}>
        <QueryClientProvider client={queryClient}>
          {electionId ? (
            <FeaturesProvider electionId={electionId}>
              {children}
            </FeaturesProvider>
          ) : (
            children
          )}
        </QueryClientProvider>
      </ApiClientContext.Provider>
    </TestErrorBoundary>
  );
}

export const sliUser: User = {
  orgId: 'sli',
  isVotingWorksUser: false,
  isSliUser: true,
};

export const nonVxUser: User = {
  orgId: '123',
  isVotingWorksUser: false,
  isSliUser: false,
};

export const vxUser: User = {
  orgId: 'votingworks',
  isVotingWorksUser: true,
  isSliUser: false,
};
