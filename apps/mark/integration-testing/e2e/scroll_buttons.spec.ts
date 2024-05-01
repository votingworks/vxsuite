import { expect, test } from '@playwright/test';
import {
  electionGeneralDefinition,
  electionGeneralJson,
} from '@votingworks/fixtures';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import assert from 'assert';
import {
  mockCardRemoval,
  mockElectionManagerCardInsertion,
  mockPollWorkerCardInsertion,
} from '@votingworks/auth';
import { enterPin, findMoreButtons, forceReset } from './helpers';

const usbHandler = getMockFileUsbDriveHandler();

test.beforeEach(async ({ page }) => {
  usbHandler.cleanup();
  await forceReset(page);
});

test('configure, open polls, and test contest scroll buttons', async ({
  page,
}) => {
  const electionDefinition = electionGeneralDefinition;
  const { electionHash } = electionDefinition;
  await page.goto('/');

  // Election Manager: configure
  await page
    .getByText('Insert an Election Manager card to configure VxMark')
    .waitFor();
  mockElectionManagerCardInsertion({
    electionHash,
  });
  await enterPin(page);
  await page
    .getByText('Insert a USB drive containing an election package')
    .waitFor();

  usbHandler.insert(
    await mockElectionPackageFileTree(electionGeneralJson.toElectionPackage())
  );

  // Election Manager: set precinct
  await page.getByText('Precinct', { exact: true }).waitFor();
  await page
    .getByTestId('selectPrecinct')
    .selectOption({ label: 'All Precincts' });

  mockCardRemoval();

  // Poll Worker: open polls
  await page.getByText('Insert Poll Worker card to open').waitFor();
  mockPollWorkerCardInsertion({
    electionHash,
  });
  await page.getByText('Open Polls').click();
  const confirmDialog = page.getByRole('alertdialog');
  assert(confirmDialog);
  await confirmDialog.getByRole('button', { name: 'Open Polls' }).click();

  // Poll Worker: initiate voting session
  await page.getByText('Center Springfield').click();
  await page.getByText('12').click();
  await page.getByText('Voting Session Active:').waitFor();
  mockCardRemoval();

  await page
    .getByRole('button', {
      name: /start voting/i,
    })
    .click();

  await page
    .getByText(/contest number: 1/i)
    .first() // Rendered multiple times as visible and audio-only elements.
    .waitFor();
  await page.getByRole('button', { name: /next/i }).click();
  await page.getByRole('button', { name: /next/i }).click();

  await expect(page.getByText('Brad Plunkard')).toBeInViewport();

  expect(await findMoreButtons(page)).toHaveLength(0);

  await page.getByRole('button', { name: /next/i }).click();

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

  usbHandler.cleanup();
});
