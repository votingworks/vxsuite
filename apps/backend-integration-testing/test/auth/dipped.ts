import {
  INTEGRATION_TEST_DEFAULT_PIN,
  mockCardRemoval,
  mockElectionManagerCardInsertion,
  mockSystemAdministratorCardInsertion,
} from '@votingworks/auth';
import { Election } from '@votingworks/types';

interface AuthApiClient {
  checkPin(input: { pin: string }): Promise<void>;
}

export async function mockSystemAdministratorAuth(
  apiClient: AuthApiClient
): Promise<void> {
  mockSystemAdministratorCardInsertion();
  await apiClient.checkPin({ pin: INTEGRATION_TEST_DEFAULT_PIN });
  mockCardRemoval();
}

export async function mockElectionManagerAuth(
  apiClient: AuthApiClient,
  election: Election
): Promise<void> {
  mockElectionManagerCardInsertion({ election });
  await apiClient.checkPin({ pin: INTEGRATION_TEST_DEFAULT_PIN });
  mockCardRemoval();
}
