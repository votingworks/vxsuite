import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  Api,
  ElectionFeature,
  ElectionFeaturesConfig,
  User,
  UserFeature,
  UserFeaturesConfig,
  Jurisdiction,
} from '@votingworks/design-backend';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import { AppBase, TestErrorBoundary } from '@votingworks/ui';
import { ElectionId } from '@votingworks/types';
import { ApiClientContext, createQueryClient } from '../src/api';

export type MockApiClient = MockClient<Api>;

export function createMockApiClient(): MockApiClient {
  return createMockClient<Api>();
}

const allUserFeaturesOnConfig: Record<UserFeature, boolean> = {
  EXPORT_SCREEN: true,
  CHOOSE_BALLOT_TEMPLATE: true,
  EXPORT_TEST_DECKS: true,

  SYSTEM_SETTINGS_SCREEN: true,
  VXSCAN_BMD_BALLOT_SCANNING_SYSTEM_SETTING: true,
  VXSCAN_ALARMS_SYSTEM_SETTING: true,
  BMD_OVERVOTE_SYSTEM_SETTING: true,
  BMD_EXTRA_PRINT_MODES_SYSTEM_SETTING: true,
  QUICK_RESULTS_REPORTING_SYSTEM_SETTING: true,
  SYSTEM_LIMIT_CHECKS_SYSTEM_SETTING: true,
  VOTER_HELP_BUTTONS_SYSTEM_SETTING: true,

  ACCESS_ALL_ORGS: true,
  ONLY_LETTER_AND_LEGAL_PAPER_SIZES: true,
  BALLOT_LANGUAGE_CONFIG: true,
  AUDIO_PROOFING: true,
  MS_SEMS_CONVERSION: true,
};

const allElectionFeaturesOffConfig: Record<ElectionFeature, boolean> = {
  PRECINCT_SPLIT_ELECTION_TITLE_OVERRIDE: false,
  PRECINCT_SPLIT_ELECTION_SEAL_OVERRIDE: false,
  PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE_OVERRIDE: false,
  PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION_OVERRIDE: false,
};

export function mockUserFeatures(
  apiClient: MockApiClient,
  features?: Partial<UserFeaturesConfig>
): void {
  if (features) {
    apiClient.getUserFeatures.reset();
  }
  apiClient.getUserFeatures.expectCallWith().resolves({
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
    <AppBase
      defaultColorMode="desktop"
      defaultSizeMode="desktop"
      showScrollBars
    >
      <TestErrorBoundary>
        <ApiClientContext.Provider value={apiMock}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </ApiClientContext.Provider>
      </TestErrorBoundary>
    </AppBase>
  );
}

export const org: Jurisdiction = {
  id: 'org1',
  name: 'Test Organization',
};

export const org2: Jurisdiction = {
  id: 'org2',
  name: 'Another Organization',
};

export const user: User = {
  name: 'Test User',
  id: 'auth0|123456789',
  organizations: [org],
};

export const multiOrgUser: User = {
  name: 'Multi Org User',
  id: 'auth0|987654321',
  organizations: [org, org2],
};
