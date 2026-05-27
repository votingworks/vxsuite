import test from '@playwright/test';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import {
  clearTemporaryRootDir,
  electionFamousNames2021Fixtures,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import { buildIntegrationTestHelper } from '@votingworks/test-utils';
import {
  forceLogOutAndResetElectionDefinition,
  logInAsElectionManager,
} from './support/auth';

test.beforeAll(setupTemporaryRootDir);
test.afterAll(clearTemporaryRootDir);

test.beforeEach(async ({ page }) => {
  await forceLogOutAndResetElectionDefinition(page);
  getMockFileUsbDriveHandler().cleanup();
});

test('screenshots', async ({ page }) => {
  const fixtureSet = electionFamousNames2021Fixtures;
  const usbHandler = getMockFileUsbDriveHandler();
  const { screenshot } = buildIntegrationTestHelper(page);

  await page
    .getByText('Insert an election manager card to configure VxScan')
    .waitFor();
  await screenshot('unconfigured-screen');

  await logInAsElectionManager(page, fixtureSet.readElection());
  await page
    .getByText('Insert a USB drive containing an election package')
    .waitFor();
  await screenshot('em-insert-usb');

  usbHandler.insert(
    await mockElectionPackageFileTree(
      electionFamousNames2021Fixtures.electionJson.toElectionPackage()
    )
  );
  await page.getByText('Election Manager Menu').waitFor();
  await screenshot('em-election-manager-menu');

  await page.getByLabel(/select a polling place/i).click({ force: true });
  await page.getByText('North Lincoln', { exact: true }).click();
  // Wait for the selected value to render in the dropdown control
  await page.locator('.search-select').getByText('North Lincoln').waitFor();
  await screenshot('em-polling-place-selected');
});
