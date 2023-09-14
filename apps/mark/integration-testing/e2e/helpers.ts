import { ElementHandle, Page } from '@playwright/test';
import { mockCard } from '@votingworks/auth';
import { electionGeneralDefinition } from '@votingworks/fixtures';
import { methodUrl } from '@votingworks/grout';
import { TEST_JURISDICTION } from '@votingworks/types';
import assert from 'assert';

/**
 * The election hash used in the test fixtures.
 */
export const { electionHash } = electionGeneralDefinition;

/**
 * The PIN used to log in as an election manager.
 */
export const PIN = '000000';

/**
 * Find all the "More" buttons on the page.
 */
export async function findMoreButtons(
  page: Page
): Promise<Array<ElementHandle<HTMLButtonElement>>> {
  const buttons = await page.$$('button');
  return (
    await Promise.all(
      buttons.map(async (button) => {
        const text = await button.textContent();
        return text?.includes('More') ? button : undefined;
      })
    )
  ).filter((button): button is ElementHandle<HTMLButtonElement> =>
    Boolean(button)
  );
}

/**
 * Insert a mock Election Manager card.
 */
export function insertElectionManagerCard(): void {
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
 * Insert a mock Poll Worker card.
 */
export function insertPollWorkerCard(): void {
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
 * Remove the mock card.
 */
export function removeCard(): void {
  mockCard({
    cardStatus: {
      status: 'no_card',
    },
  });
}

/**
 * Performs the steps necessary to start a cardless voter session from scratch.
 */
export async function startCardlessVoterSession(page: Page): Promise<void> {
  await page.request.post(methodUrl('endCardlessVoterSession', '/api'), {
    data: '{}',
    headers: { 'Content-Type': 'application/json' },
  });

  await page.request.post(
    methodUrl('configureWithSampleBallotPackageForIntegrationTest', '/api'),
    {
      data: '{}',
      headers: { 'Content-Type': 'application/json' },
    }
  );

  insertElectionManagerCard();

  await page.goto('/');

  for (const digit of PIN) {
    await page.click(`text=${digit}`);
  }

  // select the dropdown element
  await page.waitForSelector('text=Precinct');
  const dropdown = await page.$('#selectPrecinct');
  assert(dropdown);

  // select the option with the text "All Precincts"
  await dropdown.selectOption({ label: 'All Precincts' });

  removeCard();

  // Back at the home screen
  await page.waitForSelector('text=Insert Poll Worker card to open');

  // Open polls
  insertPollWorkerCard();
  await page.click('text=Open Polls');

  // click "Open Polls" button
  const confirmDialog = page.getByRole('alertdialog');
  assert(confirmDialog);

  await confirmDialog.getByRole('button', { name: 'Open Polls' }).click();

  removeCard();

  await page.waitForSelector('text=Insert Card');

  insertPollWorkerCard();

  await page.click('text=Center Springfield');
  await page.click('text=12');
  await page.waitForSelector(
    'text=Voting Session Active: 12 at Center Springfield'
  );

  removeCard();
}
