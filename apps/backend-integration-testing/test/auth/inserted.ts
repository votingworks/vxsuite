import {
  INTEGRATION_TEST_DEFAULT_PIN,
  mockElectionManagerCardInsertion,
  mockPollWorkerCardInsertion,
  mockSystemAdministratorCardInsertion,
} from '@votingworks/auth';
import { Election } from '@votingworks/types';

interface AuthApiClient {
  checkPin(input: { pin: string }): Promise<void>;
}

export { mockCardRemoval } from '@votingworks/auth';

export async function mockSystemAdministratorAuth(
  apiClient: AuthApiClient
): Promise<void> {
  mockSystemAdministratorCardInsertion();
  await apiClient.checkPin({ pin: INTEGRATION_TEST_DEFAULT_PIN });
}

export async function mockElectionManagerAuth(
  apiClient: AuthApiClient,
  election: Election
): Promise<void> {
  mockElectionManagerCardInsertion({ election });
  await apiClient.checkPin({ pin: INTEGRATION_TEST_DEFAULT_PIN });
}

export async function mockPollWorkerAuth(
  apiClient: AuthApiClient,
  election: Election
): Promise<void> {
  mockPollWorkerCardInsertion({ election });
  await apiClient.checkPin({ pin: INTEGRATION_TEST_DEFAULT_PIN });
}
