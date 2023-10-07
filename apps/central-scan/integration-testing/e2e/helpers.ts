import { Page } from '@playwright/test';
import { mockCard } from '@votingworks/auth';
import { methodUrl } from '@votingworks/grout';
import { TEST_JURISDICTION } from '@votingworks/types';

const PIN = '000000';

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
    pin: PIN,
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
    pin: PIN,
  });
}

/**
 * Enters the PIN into the PIN pad.
 */
export async function enterPin(page: Page): Promise<void> {
  await page.getByText('Enter the card PIN to unlock.').waitFor();
  for (const digit of PIN) {
    await page.getByRole('button', { name: digit }).click();
  }
  await page.getByText('VxCentralScan Unlocked').waitFor(); // avoid flaky auth from premature card removal
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
  electionHash: string
): Promise<void> {
  mockElectionManagerCardInsertion({
    electionHash,
  });
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
