import test from '@playwright/test';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import {
  clearTemporaryRootDir,
  electionFamousNames2021Fixtures,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { getMockFileFujitsuPrinterHandler } from '@votingworks/fujitsu-thermal-printer';
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
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });

  await page.getByRole('tab', { name: 'Printer' }).click();
  await page.getByText('The printer is loaded with paper.').waitFor();
  await screenshot('em-printer-tab');

  const printerHandler = getMockFileFujitsuPrinterHandler();

  await page.getByRole('button', { name: 'Load Paper' }).click();
  await page.getByText('Remove Paper Roll Holder').waitFor();
  await screenshot('em-printer-remove-roll-holder');

  printerHandler.setStatus({ state: 'cover-open' });
  await page.getByText('Load New Paper Roll').waitFor();
  await screenshot('em-printer-load-new-roll');

  printerHandler.setStatus({ state: 'idle' });
  await page.getByText('Paper Detected').waitFor();
  await screenshot('em-printer-paper-detected');

  await page.getByRole('button', { name: 'Print Test Page' }).click();
  await page.getByText('Test Page Printed').waitFor();
  await screenshot('em-printer-test-page-printed');
  await page.getByRole('button', { name: 'Pass' }).click();

  await page.getByRole('tab', { name: 'Scanner' }).click();
  await page.getByText('Calibrate Double Sheet Detection').waitFor();
  await screenshot('em-scanner-tab');

  await page.getByRole('tab', { name: 'CVRs and Logs' }).click();
  await page.getByText('Save CVRs').waitFor();
  await screenshot('em-cvrs-and-logs-tab');
  await screenshotWithFocusHighlight('Save CVRs', 'em-save-cvrs-button');
  await screenshotWithFocusHighlight('Save Logs', 'em-save-logs-button');
  await page.getByRole('button', { name: 'Save Logs' }).click();
  await page.getByText('Save Logs', { exact: true }).nth(1).waitFor();
  await screenshot('em-save-logs-modal');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });

  await page.getByRole('tab', { name: 'More' }).click();
  await page.getByText('Set Date and Time').waitFor();
  await screenshotWithFocusHighlight('Set Date and Time', 'em-set-date-time');
  await screenshotWithFocusHighlight('Mute Sounds', 'em-mute-sounds');
  await screenshotWithFocusHighlight(
    'Signed Hash Validation',
    'em-signed-hash-validation'
  );
  await screenshotWithFocusHighlight('Diagnostics', 'em-diagnostics');
  await screenshotWithFocusHighlight('Power Down', 'em-power-down');
});
