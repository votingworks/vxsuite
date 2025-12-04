/* eslint-disable vx/gts-jsdoc */
import { Page } from '@playwright/test';
import {
  INTEGRATION_TEST_DEFAULT_PIN,
  mockCardRemoval,
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
  for (const digit of INTEGRATION_TEST_DEFAULT_PIN) {
    await page.getByText(digit).click();
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
 * Logs in as poll worker.
 */
export async function logInAsPollWorker(
  page: Page,
  election: Election
): Promise<void> {
  mockPollWorkerCardInsertion({ election });
  await enterPin(page);
}

export async function forceUnconfigure(page: Page): Promise<void> {
  await page.goto('/');
  mockCardRemoval();
  await page.waitForTimeout(100);

  await logInAsSystemAdministrator(page);
  await page.getByText('System Administrator Menu').waitFor();
  const unconfigureButton = page.getByRole('button', {
    name: 'Unconfigure Machine',
  });
  if (await unconfigureButton.isEnabled()) {
    await unconfigureButton.click();
    const confirmButton = page.getByRole('button', {
      name: 'Delete All Election Data',
    });
    await confirmButton.click();
  }
  mockCardRemoval();
  await page
    .getByText('Insert an election manager card to configure VxMarkScan')
    .waitFor();
}
