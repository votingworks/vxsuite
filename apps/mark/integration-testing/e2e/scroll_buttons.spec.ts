import { expect, test } from '@playwright/test';
import { findMoreButtons, startCardlessVoterSession } from './helpers';

test('scroll buttons', async ({ page }) => {
  await startCardlessVoterSession(page);

  await page
    .getByRole('button', {
      name: 'Press the right button to advance to the first contest.',
    })
    .click();

  await page.waitForSelector('text=Contest 1 of 20');
  await page.getByRole('button', { name: 'next contest' }).click();
  await page.waitForSelector('text=Contest 2 of 20');
  await page.getByRole('button', { name: 'next contest' }).click();
  await page.waitForSelector('text=Contest 3 of 20');

  await expect(page.getByText('Brad Plunkard')).toBeInViewport();

  expect(await findMoreButtons(page)).toHaveLength(0);

  await page.getByRole('button', { name: 'next contest' }).click();
  await page.waitForSelector('text=Contest 4 of 20');

  // first candidate in the list should be visible
  await expect(page.getByText('Charlene Franz')).toBeInViewport();

  // click "More" to go down, the first candidate should no longer be visible
  await (await findMoreButtons(page)).pop()?.click();
  await expect(page.getByText('Charlene Franz')).not.toBeInViewport();

  // the last candidate should now be visible
  await expect(page.getByText('Henry Ash')).toBeInViewport();

  // click "More" to go up, the first candidate should be visible again
  await (await findMoreButtons(page)).shift()?.click();
  await expect(page.getByText('Charlene Franz')).toBeInViewport();
});
