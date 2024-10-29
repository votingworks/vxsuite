/* eslint-disable vx/gts-jsdoc */
import { Locator, Page } from '@playwright/test';

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
  optionLabel: string
): Promise<void> {
  await page
    .locator('.search-select')
    .filter({ has: page.getByRole('combobox', { expanded: true }) })
    .getByText(optionLabel, { exact: true })
    .click();
}

export async function waitForReportToLoad(page: Page): Promise<void> {
  await page.getByText(/Page:/).waitFor();
}
