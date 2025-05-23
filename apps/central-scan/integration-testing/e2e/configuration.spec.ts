import test from '@playwright/test';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import {
  clearTemporaryRootDir,
  electionGridLayoutNewHampshireTestBallotFixtures,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { logInAsElectionManager, forceReset } from './helpers';

test.beforeAll(setupTemporaryRootDir);
test.afterAll(clearTemporaryRootDir);

test.beforeEach(async ({ page }) => {
  await forceReset(page);
});

test('configure + scan', async ({ page }) => {
  const usbHandler = getMockFileUsbDriveHandler();
  await page
    .getByText(/Insert an election manager card to configure VxCentralScan/)
    .waitFor();

  await logInAsElectionManager(
    page,
    electionGridLayoutNewHampshireTestBallotFixtures.readElection()
  );

  usbHandler.insert(
    await mockElectionPackageFileTree(
      electionGridLayoutNewHampshireTestBallotFixtures.electionJson.toElectionPackage()
    )
  );
  await page.getByText('No ballots have been scanned').waitFor();
  usbHandler.remove();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('option', { name: 'Official Ballot Mode' }).click();

  await page.getByRole('button', { name: 'Scan' }).click();
  await page.getByText('No ballots have been scanned').waitFor();
  await page.getByText('Scan New Batch').click();
  await page.getByText('Total Sheets: 1').waitFor();

  usbHandler.cleanup();
});
