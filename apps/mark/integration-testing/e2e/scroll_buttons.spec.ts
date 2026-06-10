import { ElementHandle, Page, expect, test } from '@playwright/test';
import {
  clearTemporaryRootDir,
  electionGeneralFixtures,
  readElectionGeneralDefinition,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import {
  HP_LASER_PRINTER_CONFIG,
  getMockFilePrinterHandler,
} from '@votingworks/printing';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { mockCardRemoval } from '@votingworks/auth';
import {
  forceLogOutAndResetElectionDefinition,
  logInAsElectionManager,
} from './support/auth';
import { openPolls } from './support/flows';

const electionGeneralDefinition = readElectionGeneralDefinition();

const usbHandler = getMockFileUsbDriveHandler();
const printerHandler = getMockFilePrinterHandler();

/** Finds all the "More" scroll buttons on the page. */
async function findMoreButtons(
  page: Page
): Promise<Array<ElementHandle<HTMLButtonElement>>> {
  const buttons = await page.$$('button');
  return (
    await Promise.all(
      buttons.map(async (button) => {
        const text = await button.textContent();
        return text?.includes('More') ? button : undefined;
      })
    )
  ).filter((button): button is ElementHandle<HTMLButtonElement> =>
    Boolean(button)
  );
}

test.beforeAll(setupTemporaryRootDir);
test.afterAll(clearTemporaryRootDir);

test.beforeEach(async ({ page }) => {
  usbHandler.cleanup();
  await forceLogOutAndResetElectionDefinition(page);
});

// TODO(https://github.com/votingworks/vxsuite/issues/4900): Add a mock PAT
// device to the backend, so we can test PAT scrolling on long yes/no contests.
// We'd probably need to port this test over to `mark-scan` to do that.

test('configure, open polls, and test contest scroll buttons', async ({
  page,
}) => {
  const electionDefinition = electionGeneralDefinition;
  const { election } = electionDefinition;
  printerHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  await page.goto('/');

  // Election Manager: configure
  await page
    .getByText('Insert an election manager card to configure VxMark')
    .waitFor();
  await logInAsElectionManager(page, election);
  await page
    .getByText('Insert a USB drive containing an election package')
    .waitFor();

  usbHandler.insert(
    await mockElectionPackageFileTree(
      electionGeneralFixtures.toElectionPackage()
    )
  );

  // Election Manager: set precinct
  await page.getByText('Election Manager Menu', { exact: true }).waitFor();
  await page.getByLabel(/select a polling place/i).click({ force: true });
  await page.getByText('Center Springfield', { exact: true }).click();

  mockCardRemoval();

  // Poll Worker: open polls
  await page.getByText('Insert a poll worker card to open').waitFor();
  await openPolls(page, election);

  // Poll Worker: initiate voting session
  await page.getByText('Start Voting Session: Center Springfield').click();
  await page.getByText('Remove Card to Begin Voting Session').waitFor();
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
