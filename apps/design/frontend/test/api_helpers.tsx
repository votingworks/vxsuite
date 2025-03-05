import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  Api,
  ElectionFeaturesConfig,
  User,
  UserFeaturesConfig,
} from '@votingworks/design-backend';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import { TestErrorBoundary } from '@votingworks/ui';
import { ElectionId } from '@votingworks/types';
import { ApiClientContext, createQueryClient } from '../src/api';

export type MockApiClient = MockClient<Api>;

export function createMockApiClient(): MockApiClient {
  return createMockClient<Api>();
}

const allUserFeaturesOnConfig: UserFeaturesConfig = {
  ACCESS_ALL_ORGS: true,
  SYSTEM_SETTINGS_SCREEN: true,
  EXPORT_SCREEN: true,
  CHOOSE_BALLOT_TEMPLATE: true,
  EXPORT_TEST_DECKS: true,
  MARGINAL_MARK_THRESHOLD: true,
  ONLY_LETTER_AND_LEGAL_PAPER_SIZES: true,
  CREATE_ELECTION: true,
  DELETE_ELECTION: true,
  CREATE_DELETE_DISTRICTS: true,
  CREATE_DELETE_PRECINCTS: true,
  CREATE_DELETE_PRECINCT_SPLITS: true,
  BALLOT_LANGUAGE_CONFIG: true,
};

const allElectionFeaturesOffConfig: ElectionFeaturesConfig = {
  PRECINCT_SPLIT_ELECTION_TITLE_OVERRIDE: false,
  PRECINCT_SPLIT_ELECTION_SEAL_OVERRIDE: false,
  PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE: false,
  PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION: false,
};

export function mockUserFeatures(
  apiClient: MockApiClient,
  user: User,
  features?: Partial<UserFeaturesConfig>
): void {
  if (features) {
    apiClient.getUserFeatures.reset();
  }
  apiClient.getUserFeatures.expectCallWith({ user }).resolves({
    ...allUserFeaturesOnConfig,
    ...(features ?? {}),
  });
}

export function mockElectionFeatures(
  apiClient: MockApiClient,
  electionId: ElectionId,
  features: Partial<ElectionFeaturesConfig>
): void {
  apiClient.getElectionFeatures.expectCallWith({ electionId }).resolves({
    ...allElectionFeaturesOffConfig,
    ...features,
  });
}

export function provideApi(
  apiMock: ReturnType<typeof createMockApiClient>,
  children: React.ReactNode,
  queryClient: QueryClient = createQueryClient()
): JSX.Element {
  return (
    <TestErrorBoundary>
      <ApiClientContext.Provider value={apiMock}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </ApiClientContext.Provider>
    </TestErrorBoundary>
  );
}

export const user: User = {
  orgId: 'org1',
};
