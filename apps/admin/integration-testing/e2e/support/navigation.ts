/* eslint-disable vx/gts-jsdoc */
import type { Locator, Page } from '@playwright/test';

export function getPrimaryButton(page: Page): Locator {
  return page.locator('button[data-variant="primary"]');
}

export async function openDropdown(
  page: Page,
  ariaLabel: string
): Promise<void> {
  const input = page.locator(`[aria-label="${ariaLabel}"]`);
  await input.locator('..').click();
  await page.getByRole('combobox', { expanded: true }).waitFor();
}

export async function selectOpenDropdownOption(
  page: Page,
  optionLabel: string,
  options: { exact?: boolean } = {}
): Promise<void> {
  await page
    .locator('.search-select')
    .filter({ has: page.getByRole('combobox', { expanded: true }) })
    .getByText(optionLabel, { exact: options.exact ?? true })
    .click();
}

export async function waitForReportToLoad(page: Page): Promise<void> {
  // The "Page: x/y" indicator appears as soon as the PDF metadata loads
  // (onLoadSuccess), but the page content is painted asynchronously after
  // that. Wait for the first rendered page (react-pdf paints a
  // `.react-pdf__Page__svg` in SVG mode / a `<canvas>` in canvas mode) so a
  // screenshot taken right after doesn't catch a blank viewer.
  await page.getByText(/Page:/).waitFor();
  await page
    .locator('.react-pdf__Page__svg, .react-pdf__Page canvas')
    .first()
    .waitFor();
}
