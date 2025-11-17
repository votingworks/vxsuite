import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth } from '@votingworks/types';

export function getMockElectionManagerAuth(): DippedSmartCardAuth.AuthStatus {
  return {
    status: 'logged_in',
    user: mockElectionManagerUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  };
}

export function getMockPollWorkerAuth(): DippedSmartCardAuth.AuthStatus {
  return {
    status: 'logged_in',
    user: mockPollWorkerUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  };
}

export function getMockSystemAdministratorAuth(): DippedSmartCardAuth.AuthStatus {
  return {
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  };
}
