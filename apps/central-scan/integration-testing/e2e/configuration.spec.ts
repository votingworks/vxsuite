import test from '@playwright/test';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import {
  clearTemporaryRootDir,
  electionFamousNames2021Fixtures,
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
    electionFamousNames2021Fixtures.readElection()
  );

  usbHandler.insert(
    await mockElectionPackageFileTree(
      electionFamousNames2021Fixtures.electionJson.toElectionPackage()
    )
  );
  await page.getByText('No ballots have been scanned').waitFor();
  usbHandler.remove();

  await page.getByRole('button', { name: 'Settings' }).click();

  await page.getByRole('button', { name: 'Scan' }).click();
  await page.getByText('No ballots have been scanned').waitFor();
  await page.getByText('Scan New Batch').click();
  await page.getByText('Total Sheets: 1').waitFor();

  usbHandler.cleanup();
});
