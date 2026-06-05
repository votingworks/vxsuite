import { ElementHandle, Page } from '@playwright/test';
import {
  mockCardRemoval,
  mockSystemAdministratorCardInsertion,
} from '@votingworks/auth';
import { enterPin } from './support/auth';

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
 * Unconfigure machine through the system administrator flow.
 */
export async function forceReset(page: Page): Promise<void> {
  await page.goto('/');
  mockSystemAdministratorCardInsertion();
  await enterPin(page);

  const unconfigureButton = page.getByText('Unconfigure Machine');
  if (await unconfigureButton.isEnabled()) {
    await unconfigureButton.click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete All Election Data' })
      .click();
  }
  mockCardRemoval();
  await page
    .getByText('Insert an Election Manager card to configure VxMark')
    .waitFor();
}
