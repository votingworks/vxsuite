import { DippedSmartCardAuthApi } from '@votingworks/auth';
import { mockSessionExpiresAt } from '@votingworks/test-utils';
import {
  constructElectionKey,
  ElectionDefinition,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { Mocked } from 'vitest';

export function mockElectionManagerAuth(
  auth: Mocked<DippedSmartCardAuthApi>,
  electionDefinition: ElectionDefinition,
  jurisdiction = TEST_JURISDICTION
): void {
  auth.getAuthStatus.mockResolvedValue({
    status: 'logged_in',
    user: {
      role: 'election_manager',
      jurisdiction,
      electionKey: constructElectionKey(electionDefinition.election),
    },
    sessionExpiresAt: mockSessionExpiresAt(),
  });
}

export function mockSystemAdministratorAuth(
  auth: Mocked<DippedSmartCardAuthApi>,
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
