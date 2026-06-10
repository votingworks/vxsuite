import { expect, test } from '@playwright/test';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';

/**
 * Registers a Playwright test asserting that the bundled "Vx Roboto" font is
 * installed and loadable in the running app. Identical across every app, so
 * each app's `fonts.spec.ts` just calls this. Registers nothing unless called.
 */
export function defineFontInstallationTest(): void {
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
}
