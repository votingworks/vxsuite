import { ElectionDefinition } from '@votingworks/types';
import {
  fakeElectionManagerUser,
  fakeSystemAdministratorUser,
} from '@votingworks/test-utils';
import { screen } from '@testing-library/react';

import { MockApiClient, setAuthStatus } from '../helpers/api';

export async function logOut(mockApiClient: MockApiClient): Promise<void> {
  setAuthStatus(mockApiClient, {
    status: 'logged_out',
    reason: 'machine_locked',
  });
  await screen.findByText('VxAdmin is Locked');
}

export async function authenticateAsSystemAdministrator(
  mockApiClient: MockApiClient
): Promise<void> {
  // First verify that we're logged out
  await screen.findByText('VxAdmin is Locked');

  setAuthStatus(mockApiClient, {
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    programmableCard: { status: 'no_card' },
  });
  await screen.findByText('Lock Machine');
}

export async function authenticateAsElectionManager(
  mockApiClient: MockApiClient,
  electionDefinition: ElectionDefinition
): Promise<void> {
  // First verify that we're logged out
  await screen.findByText('VxAdmin is Locked');

  setAuthStatus(mockApiClient, {
    status: 'logged_in',
    user: fakeElectionManagerUser({
      electionHash: electionDefinition.electionHash,
    }),
  });
  await screen.findByText('Lock Machine');
}
