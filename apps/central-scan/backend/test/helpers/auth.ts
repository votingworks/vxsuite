import { DippedSmartCardAuthApi } from '@votingworks/auth';
import { mockSessionExpiresAt } from '@votingworks/test-utils';
import { ElectionDefinition, TEST_JURISDICTION } from '@votingworks/types';

export function mockElectionManagerAuth(
  auth: jest.Mocked<DippedSmartCardAuthApi>,
  electionDefinition: ElectionDefinition,
  jurisdiction = TEST_JURISDICTION
): void {
  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: {
      role: 'election_manager',
      jurisdiction,
      electionHash: electionDefinition.electionHash,
    },
    sessionExpiresAt: mockSessionExpiresAt(),
  });
}

export function mockSystemAdministratorAuth(
  auth: jest.Mocked<DippedSmartCardAuthApi>,
  jurisdiction = TEST_JURISDICTION
): void {
  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: {
      role: 'system_administrator',
      jurisdiction,
    },
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  });
}
