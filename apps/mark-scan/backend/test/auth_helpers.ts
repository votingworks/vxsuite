import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import {
  mockCardlessVoterUser,
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockOf,
} from '@votingworks/test-utils';
import { CardlessVoterUser, ElectionDefinition } from '@votingworks/types';

export function mockElectionManagerAuth(
  auth: InsertedSmartCardAuthApi,
  electionDefinition: ElectionDefinition
): void {
  mockOf(auth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockElectionManagerUser(electionDefinition),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
}

export function mockPollWorkerAuth(
  auth: InsertedSmartCardAuthApi,
  electionDefinition: ElectionDefinition
): void {
  mockOf(auth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockPollWorkerUser(electionDefinition),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
}

export function mockCardlessVoterAuth(
  auth: InsertedSmartCardAuthApi,
  cardlessVoterProps: Partial<CardlessVoterUser> = {}
): void {
  mockOf(auth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockCardlessVoterUser(cardlessVoterProps),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
}
