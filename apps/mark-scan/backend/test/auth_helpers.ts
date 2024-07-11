import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import {
  mockCardlessVoterUser,
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
  mockOf,
} from '@votingworks/test-utils';
import {
  CardlessVoterUser,
  electionAuthKey,
  ElectionDefinition,
} from '@votingworks/types';

export function mockLoggedOutAuth(auth: InsertedSmartCardAuthApi): void {
  mockOf(auth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_out',
      reason: 'no_card',
    })
  );
}

export function mockSystemAdminAuth(auth: InsertedSmartCardAuthApi): void {
  mockOf(auth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockSystemAdministratorUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
}

export function mockElectionManagerAuth(
  auth: InsertedSmartCardAuthApi,
  electionDefinition: ElectionDefinition
): void {
  mockOf(auth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockElectionManagerUser({
        electionKey: electionAuthKey(electionDefinition.election),
      }),
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
      user: mockPollWorkerUser({
        electionKey: electionAuthKey(electionDefinition.election),
      }),
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
