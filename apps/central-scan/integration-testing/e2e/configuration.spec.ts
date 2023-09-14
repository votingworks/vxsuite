import test from '@playwright/test';
import { logOutAndResetElectionDefinition } from './helpers';

test.beforeEach(async ({ page }) => {
  await logOutAndResetElectionDefinition(page);
});

test('configured basics', async ({ page }) => {
  await page.click('text=Admin');
  await page.click('text=Toggle to Official Ballot Mode');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Toggle to Official Ballot Mode' })
    .click();
  await page.waitForSelector('text=No ballots have been scanned');
  await page.click('text=Scan New Batch');
  await page.waitForSelector(
    'text=A total of 1 ballot has been scanned in 1 batch.'
  );
});
