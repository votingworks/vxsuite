import type { SmartCardAuthApi } from '@votingworks/design-backend';
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import {
  DippedSmartCardAuth,
  DEFAULT_SYSTEM_SETTINGS,
  TEST_JURISDICTION,
} from '@votingworks/types';

export type MockSmartCardAuthApiClient = MockClient<SmartCardAuthApi>;

export function createMockSmartCardAuthApiClient(): MockSmartCardAuthApiClient {
  return createMockClient<SmartCardAuthApi>();
}

/**
 * Mocks a deployment that authenticates users via Auth0, which reports no smart
 * card auth status.
 */
export function mockAuth0Deployment(
  apiClient: MockSmartCardAuthApiClient
): void {
  apiClient.getAuthStatus.expectRepeatedCallsWith().resolves(null);
}

export function mockAuthStatus(
  apiClient: MockSmartCardAuthApiClient,
  authStatus: DippedSmartCardAuth.AuthStatus
): void {
  apiClient.getAuthStatus.expectRepeatedCallsWith().resolves(authStatus);
}

export function mockSystemAdministratorAuthStatus(
  apiClient: MockSmartCardAuthApiClient
): void {
  mockAuthStatus(apiClient, {
    status: 'logged_in',
    user: {
      role: 'system_administrator',
      jurisdiction: TEST_JURISDICTION,
      programmingMachineType: 'admin',
    },
    sessionExpiresAt: new Date(
      Date.now() +
        DEFAULT_SYSTEM_SETTINGS.auth.overallSessionTimeLimitHours *
          60 *
          60 *
          1000
    ),
    programmableCard: { status: 'no_card' },
  });
}
