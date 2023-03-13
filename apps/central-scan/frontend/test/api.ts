import type { Api } from '@votingworks/central-scan-backend'; // eslint-disable-line vx/gts-no-import-export-type
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import { DippedSmartCardAuth } from '@votingworks/types';

export type MockApiClient = MockClient<Api>;

export function createMockApiClient(): MockApiClient {
  return createMockClient<Api>();
}

export function setAuthStatus(
  mockApiClient: MockApiClient,
  authStatus: DippedSmartCardAuth.AuthStatus
): void {
  mockApiClient.getAuthStatus.expectRepeatedCallsWith().resolves(authStatus);
}
