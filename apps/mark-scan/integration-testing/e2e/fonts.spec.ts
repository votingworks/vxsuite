import { expect, test } from '@playwright/test';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';

test.beforeAll(setupTemporaryRootDir);
test.afterAll(clearTemporaryRootDir);

test('check roboto font installation', async ({ page }) => {
  await page.goto('/');

  // Wait for fonts to load:
  await page.evaluate(
    async () => await document.fonts.load(`1rem 'Vx Roboto'`)
  );

  expect(
    await page.evaluate(() => document.fonts.check(`1rem 'Vx Roboto'`))
  ).toEqual(true);
});
