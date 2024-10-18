import { Page } from '@playwright/test';
import {
  INTEGRATION_TEST_DEFAULT_PIN,
  mockCard,
  mockElectionManagerCardInsertion,
  mockSystemAdministratorCardInsertion,
} from '@votingworks/auth';
import { methodUrl } from '@votingworks/grout';
import { Election } from '@votingworks/types';

/**
 * Enters the PIN into the PIN pad.
 */
export async function enterPin(page: Page): Promise<void> {
  await page.getByText('Enter Card PIN').waitFor();
  for (const digit of INTEGRATION_TEST_DEFAULT_PIN) {
    await page.getByRole('button', { name: digit }).click();
  }
  await page.getByText('Remove card to unlock VxCentralScan').waitFor(); // avoid flaky auth from premature card removal
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

/**
 * Logs in as system administrator.
 */
export async function logInAsSystemAdministrator(page: Page): Promise<void> {
  mockSystemAdministratorCardInsertion();
  await enterPin(page);
  mockCardRemoval();
  await page.getByText('Lock Machine').waitFor();
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
  mockCardRemoval();
  await page.getByText('Lock Machine').waitFor();
}

/**
 * Logs out of the application, bypassing the UI.
 */
export async function forceLogOut(page: Page): Promise<void> {
  await page.request.post(methodUrl('logOut', '/api'), {
    data: '{}',
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Logs out and resets the application by removing the election definition.
 */
export async function forceReset(page: Page): Promise<void> {
  await page.request.post(methodUrl('unconfigure', '/api'), {
    data: JSON.stringify({
      ignoreBackupRequirement: true,
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  await forceLogOut(page);
  await page.goto('/');
}
