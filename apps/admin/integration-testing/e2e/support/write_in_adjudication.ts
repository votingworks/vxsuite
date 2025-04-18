/* eslint-disable vx/gts-jsdoc */
import { Locator, Page } from '@playwright/test';

export function getAdjudicateButtons(page: Page): Locator {
  return page.getByText(/Adjudicate.*/);
}

export function getDropdownOptions(page: Page): Locator {
  return page.locator('div[aria-disabled="false"]');
}

export async function selectCandidateOrUndervote(
  page: Page,
  index: number
): Promise<void> {
  const dropdownOptions = getDropdownOptions(page);
  const selection = dropdownOptions.nth(
    index % (await dropdownOptions.count())
  );
  await selection.click();
}

export const WRITE_IN_NAMES = [
  'John Smith',
  'Mary Johnson',
  'James Brown',
  'Sarah Davis',
  'Michael Wilson',
  'Emily White',
  'David Miller',
  'Laura Taylor',
  'Robert Anderson',
  'Linda Thomas',
  'Daniel Lee',
  'Susan Harris',
  'Paul Clark',
  'Anna Lewis',
  'Mark Walker',
  'Jessica Hall',
  'Andrew King',
  'Megan Wright',
  'Thomas Scott',
  'Patricia Young',
  'Christopher Green',
  'Karen Adams',
  'Matthew Baker',
  'Nancy Perez',
];
