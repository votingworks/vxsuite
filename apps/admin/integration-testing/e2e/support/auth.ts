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
  await page.waitForSelector('text=Enter the card PIN to unlock.');
  for (const digit of PIN) {
    await page.getByRole('button', { name: digit }).click();
  }
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
 * Logs out of the application.
 */
export async function logOut(page: Page): Promise<void> {
  await page.request.post(methodUrl('logOut', 'http://localhost:3000/api'), {
    data: '{}',
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Logs out and resets the application by removing the election definition.
 */
export async function logOutAndResetElectionDefinition(
  page: Page
): Promise<void> {
  await logOut(page);
  await page.goto('/');
  mockSystemAdministratorCardInsertion();

  if (await page.$('button:has-text("Reset Card PIN")')) {
    mockCardRemoval();
    await page.waitForSelector('text=Insert Card');
    mockSystemAdministratorCardInsertion();
  }

  await enterPin(page);

  mockCardRemoval();
  await page.click('text=Definition');

  const removeElectionButton = await page.$(
    'button:has-text("Remove Election")'
  );

  if (removeElectionButton) {
    await removeElectionButton.click();
    await page.click('text=Remove Election Definition');
  }

  await logOut(page);
}
