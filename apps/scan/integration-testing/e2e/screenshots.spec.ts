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
  const { screenshot, screenshotWithFocusHighlight } =
    buildIntegrationTestHelper(page);

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

  await screenshotWithFocusHighlight(
    'Official Ballot Mode',
    'em-official-ballot-mode-button'
  );
  await page.getByText('Official Ballot Mode').click();
  await page.getByText('Test Ballot Mode').waitFor();
  await screenshotWithFocusHighlight(
    'Test Ballot Mode',
    'em-test-ballot-mode-button'
  );

  await screenshotWithFocusHighlight(
    'Unconfigure Machine',
    'em-unconfigure-machine-button'
  );
  await page.getByRole('button', { name: 'Unconfigure Machine' }).click();
  await page.getByRole('alertdialog').waitFor();
  await screenshot('em-unconfigure-machine-modal');
});
