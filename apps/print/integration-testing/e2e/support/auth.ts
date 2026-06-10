import type { Page } from '@playwright/test';
import {
  mockCardRemoval,
  mockPollWorkerCardInsertion,
} from '@votingworks/auth';
import type { Election } from '@votingworks/types';
import { buildDippedSmartCardAuthHelpers } from '@votingworks/integration-test-utils';

/**
 * VxPrint auth helpers for integration tests (dipped smart-card auth). The
 * system administrator lands on the Settings screen by default, which is where
 * the "Unconfigure Machine" button lives, so no `navigateToUnconfigure` step is
 * needed.
 */
export const {
  logInAsSystemAdministrator,
  logInAsElectionManager,
  logOut,
  forceLogOutAndResetElectionDefinition,
} = buildDippedSmartCardAuthHelpers({
  appName: 'VxPrint',
});

/**
 * Logs in as a poll worker. Poll worker cards have no PIN, so the dipped auth
 * flow goes straight from card insertion to the "remove card" prompt, then to
 * the logged-in poll worker app once the card is removed.
 */
export async function logInAsPollWorker(
  page: Page,
  election: Election
): Promise<void> {
  mockPollWorkerCardInsertion({ election });
  await page.getByText('Remove card to unlock VxPrint').waitFor();
  mockCardRemoval();
}
