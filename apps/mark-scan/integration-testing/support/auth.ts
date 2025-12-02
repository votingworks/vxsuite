import { Page } from '@playwright/test';
import {
  mockElectionManagerCardInsertion,
  mockPollWorkerCardInsertion,
  mockSystemAdministratorCardInsertion,
} from '@votingworks/auth';
import { Election } from '@votingworks/types';

/**
 * Enters the PIN into the PIN pad.
 */
export async function enterPin(page: Page): Promise<void> {
  await page.getByText('Enter Card PIN').waitFor();
  for (let i = 0; i < 6; i += 1) {
    await page.getByText('0').click();
  }
}

/**
 * Logs in as system administrator.
 */
export async function logInAsSystemAdministrator(page: Page): Promise<void> {
  mockSystemAdministratorCardInsertion();
  await enterPin(page);
  await page.getByText('System Administrator Menu').waitFor();
}

/**
 * Logs in as election manager.
 */
export async function logInAsElectionManager(
  page: Page,
  election: Election
): Promise<void> {
  mockElectionManagerCardInsertion({ election });
  await enterPin(page);
}

/**
 * Logs in as election manager.
 */
export async function logInAsPollWorker(
  page: Page,
  election: Election
): Promise<void> {
  mockPollWorkerCardInsertion({ election });
  await enterPin(page);
}
