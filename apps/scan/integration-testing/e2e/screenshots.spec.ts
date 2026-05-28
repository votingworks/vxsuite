import test from '@playwright/test';
import { mockCardRemoval } from '@votingworks/auth';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import {
  clearTemporaryRootDir,
  electionFamousNames2021Fixtures,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { getMockFileFujitsuPrinterHandler } from '@votingworks/fujitsu-thermal-printer';
import {
  buildIntegrationTestHelper,
  createScreenshotCounter,
} from '@votingworks/test-utils';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import {
  forceLogOutAndResetElectionDefinition,
  logInAsElectionManager,
  logInAsPollWorker,
  logInAsSystemAdministrator,
} from './support/auth';
import {
  FAMOUS_NAMES_MARKED_BALLOT_PATH,
  mockPdiScannerHandler,
} from './support/scanner';

const screenshotCounter = createScreenshotCounter();

test.beforeAll(setupTemporaryRootDir);
test.afterAll(clearTemporaryRootDir);

test.beforeEach(async ({ page }) => {
  await forceLogOutAndResetElectionDefinition(page);
  getMockFileUsbDriveHandler().cleanup();
});

test('configuration', async ({ page }) => {
  const fixtureSet = electionFamousNames2021Fixtures;
  const usbHandler = getMockFileUsbDriveHandler();
  const {
    screenshot,
    screenshotWithButtonHighlight,
    withContainerVerticallyExpanded,
  } = buildIntegrationTestHelper(page, screenshotCounter);

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

  await screenshotWithButtonHighlight(
    'Official Ballot Mode',
    'em-official-ballot-mode-button'
  );
  await page.getByText('Official Ballot Mode').click();
  await page.getByText('Test Ballot Mode').waitFor();
  await screenshotWithButtonHighlight(
    'Test Ballot Mode',
    'em-test-ballot-mode-button'
  );

  await screenshotWithButtonHighlight(
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
  await screenshotWithButtonHighlight('Save CVRs', 'em-save-cvrs-button');
  await screenshotWithButtonHighlight('Save Logs', 'em-save-logs-button');
  await page.getByRole('button', { name: 'Save Logs' }).click();
  await page.getByText('Save Logs', { exact: true }).nth(1).waitFor();
  await screenshot('em-save-logs-modal');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });

  await page.getByRole('tab', { name: 'More' }).click();
  await page.getByText('Set Date and Time').waitFor();
  await screenshotWithButtonHighlight('Set Date and Time', 'em-set-date-time');
  await page.getByRole('button', { name: 'Set Date and Time' }).click();
  await page.getByRole('alertdialog').waitFor();
  await screenshot('em-set-date-time-modal');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  await screenshotWithButtonHighlight('Mute Sounds', 'em-mute-sounds');
  await screenshotWithButtonHighlight(
    'Signed Hash Validation',
    'em-signed-hash-validation'
  );
  await screenshotWithButtonHighlight('Diagnostics', 'em-diagnostics');
  await page.getByRole('button', { name: 'Diagnostics' }).click();
  await page.getByRole('button', { name: 'Back' }).waitFor();
  await withContainerVerticallyExpanded('main', async () => {
    await screenshot('em-diagnostics-full');
  });
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('tab', { name: 'More' }).waitFor();
  await page.getByRole('tab', { name: 'More' }).click();
  await page.getByText('Power Down').waitFor();

  await screenshotWithButtonHighlight('Power Down', 'em-power-down');

  mockCardRemoval();
  await page.getByText('Insert a poll worker card to open polls.').waitFor();

  await logInAsSystemAdministrator(page);
  await screenshot('sa-menu');

  await screenshotWithButtonHighlight(
    'Unconfigure Machine',
    'sa-unconfigure-machine-button'
  );
  await page.getByRole('button', { name: 'Unconfigure Machine' }).click();
  await page.getByRole('alertdialog').waitFor();
  await screenshot('sa-unconfigure-machine-modal');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });

  await screenshotWithButtonHighlight('Set Date and Time', 'sa-set-date-time');
  await screenshotWithButtonHighlight('Diagnostics', 'sa-diagnostics');
  await screenshotWithButtonHighlight('Save Logs', 'sa-save-logs-button');
  await screenshotWithButtonHighlight(
    'Calibrate Image Sensors',
    'sa-calibrate-image-sensors'
  );
  await screenshotWithButtonHighlight(
    'Signed Hash Validation',
    'sa-signed-hash-validation'
  );
});

test('voting', async ({ page }) => {
  const fixtureSet = electionFamousNames2021Fixtures;
  const usbHandler = getMockFileUsbDriveHandler();
  const {
    screenshot,
    screenshotWithButtonHighlight,
    screenshotWithLocatorHighlight,
  } = buildIntegrationTestHelper(page, screenshotCounter);

  await page.goto('/');
  await logInAsElectionManager(page, fixtureSet.readElection());
  usbHandler.insert(
    await mockElectionPackageFileTree(
      fixtureSet.electionJson.toElectionPackage()
    )
  );
  await page.getByText('Election Manager Menu').waitFor();
  await page.getByLabel(/select a polling place/i).click({ force: true });
  await page.getByText('West Lincoln', { exact: true }).click();
  await page.locator('.search-select').getByText('West Lincoln').waitFor();
  await page.getByText('Official Ballot Mode').click();
  await page.getByText('Test Ballot Mode').waitFor();

  mockCardRemoval();
  await page.getByText('Insert a poll worker card to open polls.').waitFor();
  await screenshot('polls-closed');

  logInAsPollWorker(fixtureSet.readElection());
  await page.getByText('Do you want to open the polls?').waitFor();
  await screenshot('open-polls-prompt');
  await screenshotWithButtonHighlight('Open Polls', 'open-polls-button');

  await page.getByRole('button', { name: 'Open Polls' }).click();
  await page
    .getByRole('heading', { name: 'Polls Opened' })
    .waitFor({ timeout: 60000 });
  await screenshot('polls-opened');
  await screenshotWithButtonHighlight(
    'Reprint Polls Opened Report',
    'reprint-polls-opened-report-button'
  );

  mockCardRemoval();
  await page.getByText('Insert Your Ballot').waitFor();
  await screenshot('insert-ballot');
  await screenshotWithLocatorHighlight(
    page.getByTestId('electionInfo'),
    'insert-ballot-election-info'
  );

  mockPdiScannerHandler.insertSheet(FAMOUS_NAMES_MARKED_BALLOT_PATH);
  await page.getByText('Your ballot was counted!').waitFor({ timeout: 30000 });
  await screenshot('ballot-counted');
});
