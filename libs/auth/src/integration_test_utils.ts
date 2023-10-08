import { TEST_JURISDICTION } from '@votingworks/types';
import { mockCard } from './mock_file_card';

/**
 * The default PIN used to log in as election manager or system administrator
 * in integration tests.
 */
export const INTEGRATION_TEST_DEFAULT_PIN = '000000';

/**
 * Insert a mock System Administrator card.
 */
export function mockSystemAdministratorCardInsertion(): void {
  mockCard({
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: {
          role: 'system_administrator',
          jurisdiction: TEST_JURISDICTION,
        },
      },
    },
    pin: INTEGRATION_TEST_DEFAULT_PIN,
  });
}

/**
 * Insert a mock Election Manager card.
 */
export function mockElectionManagerCardInsertion({
  electionHash,
}: {
  electionHash: string;
}): void {
  mockCard({
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: {
          role: 'election_manager',
          jurisdiction: TEST_JURISDICTION,
          electionHash,
        },
      },
    },
    pin: INTEGRATION_TEST_DEFAULT_PIN,
  });
}

/**
 * Insert a mock Poll Worker card.
 */
export function mockPollWorkerCardInsertion({
  electionHash,
}: {
  electionHash: string;
}): void {
  mockCard({
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: {
          role: 'poll_worker',
          jurisdiction: TEST_JURISDICTION,
          electionHash,
        },
        hasPin: false,
      },
    },
  });
}

/**
 * Mocks the card being removed.
 */
export function mockCardRemoval(): void {
  mockCard({
    cardStatus: {
      status: 'no_card',
    },
  });
}
