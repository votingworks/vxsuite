import test from '@playwright/test';
import { mockBallotPackageFileTree } from '@votingworks/backend';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { logInAsElectionManager, forceReset } from './helpers';

test.beforeEach(async ({ page }) => {
  await forceReset(page);
});

test('configure + scan', async ({ page }) => {
  const usbHandler = getMockFileUsbDriveHandler();
  await page
    .getByText(/Insert an Election Manager card to configure VxCentralScan/)
    .waitFor();
  const { electionDefinition } = electionGridLayoutNewHampshireAmherstFixtures;

  await logInAsElectionManager(page, electionDefinition.electionHash);

  usbHandler.insert(
    await mockBallotPackageFileTree(
      electionGridLayoutNewHampshireAmherstFixtures.electionJson.toBallotPackage()
    )
  );
  await page.getByText('No ballots have been scanned').waitFor();
  usbHandler.remove();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByText('Toggle to Official Ballot Mode').click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Toggle to Official Ballot Mode' })
    .click();

  await page.getByText('No ballots have been scanned').waitFor();
  await page.getByText('Scan New Batch').click();
  await page
    .getByText('A total of 1 ballot has been scanned in 1 batch.')
    .waitFor();

  usbHandler.cleanup();
});
