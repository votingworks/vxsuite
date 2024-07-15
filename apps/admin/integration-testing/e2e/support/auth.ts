import { Page } from '@playwright/test';
import {
  INTEGRATION_TEST_DEFAULT_PIN,
  mockCardRemoval,
  mockElectionManagerCardInsertion,
  mockSystemAdministratorCardInsertion,
} from '@votingworks/auth';
import { methodUrl } from '@votingworks/grout';
import { Election } from '@votingworks/types';

/**
 * Enters the PIN into the PIN pad.
 */
export async function enterPin(page: Page): Promise<void> {
  await page.getByText('Enter the card PIN').waitFor();
  for (const digit of INTEGRATION_TEST_DEFAULT_PIN) {
    await page.getByRole('button', { name: digit }).click();
  }
  await page.getByText('Remove card to unlock VxAdmin').waitFor(); // avoid flaky auth from premature card removal
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
 * Logs out the user via the UI. Assumes the "Lock Machine" button is visible.
 */
export async function logOut(page: Page): Promise<void> {
  await page.getByText('Lock Machine').click();
  await page.getByText('VxAdmin is Locked').waitFor();
}

/**
 * Logs out of the application forcibly, bypassing the UI. Used between tests
 * for cleanup.
 */
export async function forceLogOut(page: Page): Promise<void> {
  await page.request.post(methodUrl('logOut', 'http://localhost:3000/api'), {
    data: '{}',
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Logs out and resets the application by removing the election definition.
 */
export async function forceLogOutAndResetElectionDefinition(
  page: Page
): Promise<void> {
  await forceLogOut(page);
  await page.goto('/');

  await logInAsSystemAdministrator(page);
  await page.getByRole('button', { name: 'Election', exact: true }).click();

  const unconfigureMachineButton = page.getByRole('button', {
    name: 'Unconfigure Machine',
  });

  if (await unconfigureMachineButton.isVisible()) {
    await unconfigureMachineButton.click();
    const modal = page.getByRole('alertdialog');
    await modal
      .getByRole('button', { name: 'Yes, Delete Election Data' })
      .click();
  }

  await forceLogOut(page);
}
