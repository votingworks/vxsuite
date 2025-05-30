import { vi } from 'vitest';
import { InsertedSmartCardAuthApi } from '@votingworks/auth';
import {
  mockCardlessVoterUser,
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
} from '@votingworks/test-utils';
import {
  CardlessVoterUser,
  constructElectionKey,
  ElectionDefinition,
} from '@votingworks/types';

export function mockLoggedOutAuth(auth: InsertedSmartCardAuthApi): void {
  vi.mocked(auth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_out',
      reason: 'no_card',
    })
  );
}

export function mockSystemAdminAuth(auth: InsertedSmartCardAuthApi): void {
  vi.mocked(auth.getAuthStatus).mockImplementation(() =>
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
  vi.mocked(auth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockElectionManagerUser({
        electionKey: constructElectionKey(electionDefinition.election),
      }),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
}

export function mockPollWorkerAuth(
  auth: InsertedSmartCardAuthApi,
  electionDefinition: ElectionDefinition
): void {
  vi.mocked(auth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockPollWorkerUser({
        electionKey: constructElectionKey(electionDefinition.election),
      }),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
}

export function mockCardlessVoterAuth(
  auth: InsertedSmartCardAuthApi,
  cardlessVoterProps: Partial<CardlessVoterUser> = {}
): void {
  vi.mocked(auth.getAuthStatus).mockImplementation(() =>
    Promise.resolve({
      status: 'logged_in',
      user: mockCardlessVoterUser(cardlessVoterProps),
      sessionExpiresAt: mockSessionExpiresAt(),
    })
  );
}
