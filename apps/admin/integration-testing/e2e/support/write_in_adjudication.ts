/* eslint-disable vx/gts-jsdoc */
import { Locator, Page } from '@playwright/test';

export function getAdjudicateButtons(page: Page): Locator {
  return page.getByText(/Adjudicate \d*/);
}

export function getCandidateButtons(page: Page): Locator {
  const heading = page.getByText('Official Candidates');
  return heading.locator('..').getByRole('button');
}

export async function selectCandidate(
  page: Page,
  index: number
): Promise<void> {
  const candidateButtons = getCandidateButtons(page);
  const candidateButton = candidateButtons.nth(
    index % (await candidateButtons.count())
  );
  await candidateButton.click();
}

export async function markUndervote(page: Page): Promise<void> {
  await page.getByText('Mark write-in as undervote').click();
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
