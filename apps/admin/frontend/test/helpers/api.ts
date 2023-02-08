import type { Api } from '@votingworks/admin-backend'; // eslint-disable-line vx/gts-no-import-export-type
import { createMockClient, MockClient } from '@votingworks/grout-test-utils';
import { DippedSmartCardAuth } from '@votingworks/types';

export type MockApiClient = Omit<MockClient<Api>, 'getAuthStatus'> & {
  // Because this is polled so frequently, we opt for a standard jest mock instead of a
  // libs/test-utils mock since the latter requires every call to be explicitly mocked
  getAuthStatus: jest.Mock;
};

export function createMockApiClient(): MockApiClient {
  const mockApiClient = createMockClient<Api>();
  // For some reason, using an object spread to override the getAuthStatus method breaks the rest
  // of the mockApiClient, so we override like this instead
  (mockApiClient.getAuthStatus as unknown as jest.Mock) = jest.fn(() =>
    Promise.resolve({ status: 'logged_out', reason: 'machine_locked' })
  );
  return mockApiClient as unknown as MockApiClient;
}

export function setAuthStatus(
  mockApiClient: MockApiClient,
  authStatus: DippedSmartCardAuth.AuthStatus
): void {
  mockApiClient.getAuthStatus.mockImplementation(() =>
    Promise.resolve(authStatus)
  );
}
