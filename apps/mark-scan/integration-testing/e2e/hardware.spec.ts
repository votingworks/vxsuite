import { test } from '@playwright/test';

test('wants hardware', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('text=No Connection to Printer-Scanner');
});
