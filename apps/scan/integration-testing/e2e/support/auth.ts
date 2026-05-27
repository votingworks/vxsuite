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
async function enterPin(page: Page): Promise<void> {
  await page.getByText('Enter Card PIN').waitFor();
  for (const digit of INTEGRATION_TEST_DEFAULT_PIN) {
    await page.getByRole('button', { name: digit }).click();
  }
}

/**
 * Logs in as system administrator. Card remains inserted.
 */
export async function logInAsSystemAdministrator(page: Page): Promise<void> {
  mockSystemAdministratorCardInsertion();
  await enterPin(page);
  await page.getByText('System Administrator Menu').waitFor();
}

/**
 * Logs in as election manager. Card remains inserted.
 */
export async function logInAsElectionManager(
  page: Page,
  election: Election
): Promise<void> {
  mockElectionManagerCardInsertion({ election });
  await enterPin(page);
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
  mockCardRemoval();

  await logInAsSystemAdministrator(page);

  const unconfigureMachineButton = page.getByRole('button', {
    name: 'Unconfigure Machine',
  });

  if (
    (await unconfigureMachineButton.isVisible()) &&
    (await unconfigureMachineButton.isEnabled())
  ) {
    await unconfigureMachineButton.click();
    const modal = page.getByRole('alertdialog');
    await modal
      .getByRole('button', { name: 'Delete All Election Data' })
      .click();
  }

  mockCardRemoval();
  await page
    .getByText('Insert an election manager card to configure VxScan')
    .waitFor();
}
