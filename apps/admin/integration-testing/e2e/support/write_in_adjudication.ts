/* eslint-disable vx/gts-jsdoc */
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

function getDropdownOptions(page: Page): Locator {
  return page.locator('div[aria-disabled="false"]');
}

async function selectCandidateOrInvalidate(
  page: Page,
  index: number
): Promise<void> {
  const dropdownOptions = getDropdownOptions(page);
  const selection = dropdownOptions.nth(
    index % (await dropdownOptions.count())
  );
  await selection.click();
}

const WRITE_IN_NAMES = [
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

async function adjudicateWriteIn(
  page: Page,
  combobox: Locator,
  writeInIndex: number
): Promise<void> {
  await combobox.click();

  // uneven but deterministic strategy for making adjudications
  switch (writeInIndex % 8) {
    case 0:
    case 1:
    case 2:
    case 3:
    case 4:
      // Creates a candidate the first time, re-selects subsequent times
      await combobox.fill('Write-In Campaign Candidate');
      await page.keyboard.press('Enter');
      break;
    case 5:
      // Select a dropdown option via clicking
      await selectCandidateOrInvalidate(page, writeInIndex);
      break;
    case 6:
      // Mark as invalid by unchecking the write-in checkbox
      await page
        .getByRole('checkbox', { name: /write-in/i, checked: true })
        .click();
      break;
    default:
      // Create other new candidate
      await combobox.fill(WRITE_IN_NAMES[Math.floor(writeInIndex / 8)]);
      await page.keyboard.press('Enter');
  }
}

export function getPendingContestItems(page: Page): Locator {
  return page.getByRole('listitem').filter({ hasText: /to adjudicate/i });
}

export async function adjudicateAllWriteIns(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Adjudicate' }).click();
  await page.getByText(/Ballot \d+ of \d+/).waitFor();

  let writeInIndex = 0;

  // Process ballots until we return to the adjudication start screen
  while (true) {
    // If we've navigated back to the start screen, adjudication is complete.
    if (
      await page
        .getByRole('heading', { name: 'Adjudication', level: 1 })
        .isVisible()
    ) {
      break;
    }

    // Wait for at least one pending contest to appear — every ballot in the
    // adjudication queue has at least one unresolved contest, but the status
    // lines render asynchronously after the ballot data loads.
    await expect(getPendingContestItems(page).first()).toBeVisible();

    // Adjudicate all pending contests on this ballot. After each contest
    // confirmation, we wait for the pending contest count to decrease before
    // checking for the next pending contest.
    let pendingCount = await getPendingContestItems(page).count();
    while (pendingCount > 0) {
      await getPendingContestItems(page).first().click();

      // Wait for the contest adjudication screen to load
      await page.getByRole('button', { name: 'Confirm' }).waitFor();

      // Adjudicate each write-in combobox
      const comboboxes = page.getByRole('combobox');
      const comboboxCount = await comboboxes.count();
      for (let j = 0; j < comboboxCount; j += 1) {
        await adjudicateWriteIn(page, comboboxes.nth(j), writeInIndex);
        writeInIndex += 1;
      }

      // Confirm and return to ballot view
      await expect(page.getByRole('button', { name: 'Confirm' })).toBeEnabled();
      await page.getByRole('button', { name: 'Confirm' }).click();

      // Wait for the ballot view to return and the data to refetch
      // (the "to adjudicate" line on the just-resolved contest should disappear)
      const expectedCount = pendingCount - 1;
      if (expectedCount > 0) {
        await expect(getPendingContestItems(page)).toHaveCount(expectedCount);
      } else {
        await expect(getPendingContestItems(page)).toHaveCount(0);
      }
      pendingCount = expectedCount;
    }

    // All contests on this ballot are resolved — accept.
    const acceptButton = page.getByRole('button', { name: 'Accept' });
    await expect(acceptButton).toBeEnabled({ timeout: 10000 });

    // Capture the current ballot indicator so we can detect when navigation
    // completes — without this, the loop can race ahead while the old
    // "Ballot D of D" text is still visible.
    const currentBallotText = await page
      .getByText(/Ballot \d+ of \d+/)
      .textContent();
    await acceptButton.click();
    await expect(
      page.getByText(currentBallotText ?? '', { exact: true })
    ).not.toBeVisible({ timeout: 10000 });
  }
}
