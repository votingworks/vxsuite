import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  Api,
  StateFeaturesConfig,
  UserFeature,
  UserFeaturesConfig,
  Jurisdiction,
  Organization,
  JurisdictionUser,
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
};

export function mockUserFeatures(
  apiClient: MockApiClient,
  features?: UserFeaturesConfig
): void {
  if (features) {
    apiClient.getUserFeatures.reset();
  }
  apiClient.getUserFeatures.expectCallWith().resolves({
    ...allUserFeaturesOnConfig,
    ...(features ?? {}),
  });
}

export function mockStateFeatures(
  apiClient: MockApiClient,
  electionId: ElectionId,
  features?: StateFeaturesConfig
): void {
  if (features) {
    apiClient.getStateFeatures.reset();
  }
  apiClient.getStateFeatures
    .expectCallWith({ electionId })
    .resolves(features ?? {});
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

export const organization: Organization = {
  id: 'organization1',
  name: 'Test Organization',
};

export const jurisdiction: Jurisdiction = {
  id: 'jurisdiction1',
  name: 'Test Jurisdiction',
  stateCode: 'DEMO',
  organization,
};

export const jurisdiction2: Jurisdiction = {
  id: 'jurisdiction2',
  name: 'Another Jurisdiction',
  stateCode: 'NH',
  organization,
};

export const user: JurisdictionUser = {
  type: 'jurisdiction_user',
  name: 'Test User',
  id: 'auth0|123456789',
  organization,
  jurisdictions: [jurisdiction],
};

export const multiJurisdictionUser: JurisdictionUser = {
  type: 'jurisdiction_user',
  name: 'Multi Jurisdiction User',
  id: 'auth0|987654321',
  organization,
  jurisdictions: [jurisdiction, jurisdiction2],
};
