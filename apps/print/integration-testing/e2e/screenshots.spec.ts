import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { Page, test } from '@playwright/test';
import { sleep } from '@votingworks/basics';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import * as grout from '@votingworks/grout';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import {
  buildIntegrationTestHelper,
  captureReadinessReport,
  createScreenshotNamer,
} from '@votingworks/integration-test-utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  DEV_MACHINE_ID,
  ElectionDefinition,
  SignedHashValidationQrCodeValue,
} from '@votingworks/types';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import {
  getMockFilePrinterHandler,
  HP_LASER_PRINTER_CONFIG,
} from '@votingworks/printing';
import {
  forceLogOutAndResetElectionDefinition,
  logInAsElectionManager,
  logInAsPollWorker,
  logInAsSystemAdministrator,
  logOut,
} from './support/auth';
import {
  getElectionDefinition,
  NO_SPLIT_POLLING_PLACE,
  SPLIT_POLLING_PLACE,
} from './support/election';
import { buildBallotsForElection, configureMachine } from './support/flows';
import { capturePrintedBallotsReport } from './support/reports';

test.beforeAll(setupTemporaryRootDir);
test.afterAll(clearTemporaryRootDir);

test.beforeEach(async ({ page }) => {
  getMockFileUsbDriveHandler().cleanup();
  getMockFilePrinterHandler().connectPrinter(HP_LASER_PRINTER_CONFIG);
  await forceLogOutAndResetElectionDefinition(page);
});

// Leave the machine unconfigured and logged out so each test starts clean.
test.afterEach(async ({ page }) => {
  await forceLogOutAndResetElectionDefinition(page);
});

async function buildElectionPackage(electionDefinition: ElectionDefinition) {
  const ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official', 'test'],
  });
  return mockElectionPackageFileTree({
    electionDefinition,
    ballots,
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
  });
}

/** Navigates the left-nav to the named screen (e.g. "Settings", "Election"). */
async function navigateTo(page: Page, linkName: string): Promise<void> {
  await page.getByRole('button', { name: linkName, exact: true }).click();
}

/**
 * Deterministically generates a base64 string of `byteLength` bytes from a
 * seed, by chaining SHA-256 hashes. Used to mock the signed hash validation QR
 * code with realistic-looking, reproducible data (rather than random bytes,
 * which would change the QR every run).
 */
function pseudoRandomBase64(seed: string, byteLength: number): string {
  const chunks: Buffer[] = [];
  let length = 0;
  let chunk = createHash('sha256').update(seed).digest();
  while (length < byteLength) {
    chunks.push(chunk);
    length += chunk.length;
    chunk = createHash('sha256').update(chunk).digest();
  }
  return Buffer.concat(chunks).subarray(0, byteLength).toString('base64');
}

test('election manager: configuration and settings', async ({
  page,
}, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  const electionDefinition = getElectionDefinition();
  const { election } = electionDefinition;
  const usbHandler = getMockFileUsbDriveHandler();
  const {
    screenshot,
    screenshotWithButtonHighlight,
    withContainerVerticallyExpanded,
  } = buildIntegrationTestHelper(page, namer);
  const electionPackage = await buildElectionPackage(electionDefinition);

  // Locked, unconfigured: prompt to insert an election manager card.
  await page
    .getByText('Insert an election manager card to configure VxPrint')
    .waitFor();
  await screenshot('locked-unconfigured');

  // Election manager logs in; prompted to insert a USB drive.
  await logInAsElectionManager(page, election);
  await page
    .getByText('Insert a USB drive containing an election package')
    .waitFor();
  await screenshot('em-insert-usb');

  // Configuring progress screen. Configuration completes too quickly to
  // screenshot reliably, so delay the response just long enough to capture it.
  await page.route('**/api/configureElectionPackageFromUsb', async (route) => {
    await sleep(4000);
    await route.continue();
  });
  usbHandler.insert(electionPackage);
  await page.getByText(/Configuring VxPrint/).waitFor();
  await screenshot('em-configuring');
  await page.unroute('**/api/configureElectionPackageFromUsb');

  // After configuration the app stays on the last-active route (the reset
  // helper leaves it on /settings), so navigate to the Election screen.
  await navigateTo(page, 'Election');
  await page.getByLabel(/select a polling place/i).waitFor();
  await screenshot('em-election-screen');

  // Open the polling place dropdown to show the list of places.
  await page.getByLabel(/select a polling place/i).click({ force: true });
  await page.getByText(SPLIT_POLLING_PLACE, { exact: true }).waitFor();
  await screenshot('em-polling-place-dropdown');
  await page.getByText(SPLIT_POLLING_PLACE, { exact: true }).click();

  // Settings screen — ballot mode. The control flips the mode on any change,
  // and the machine defaults to official mode. Switch to test mode to capture
  // "test mode with Official highlighted", then switch back for "official mode
  // with Test highlighted". With no ballots printed yet, switching skips the
  // confirmation modal. Toggling shows/hides the test-mode banner, which shifts
  // the layout, so settle before highlighting an option so the overlay aligns.
  await navigateTo(page, 'Settings');
  await page
    .getByRole('option', { name: 'Official Ballot Mode', selected: true })
    .waitFor();
  await page.getByRole('option', { name: 'Test Ballot Mode' }).click();
  await page
    .getByRole('option', { name: 'Test Ballot Mode', selected: true })
    .waitFor();
  await page.waitForTimeout(300);
  await screenshotWithButtonHighlight(
    'Official Ballot Mode',
    'em-settings-ballot-mode-official-highlighted'
  );
  await page.getByRole('option', { name: 'Official Ballot Mode' }).click();
  await page
    .getByRole('option', { name: 'Official Ballot Mode', selected: true })
    .waitFor();
  await page.waitForTimeout(300);
  await screenshotWithButtonHighlight(
    'Test Ballot Mode',
    'em-settings-ballot-mode-test-highlighted'
  );

  // Save Logs (the USB drive is still inserted, so the format selector shows).
  await screenshotWithButtonHighlight(
    'Save Logs',
    'em-settings-save-logs-highlighted'
  );
  await page.getByRole('button', { name: 'Save Logs' }).click();
  await page
    .getByRole('alertdialog')
    .getByText('Select a log format')
    .waitFor();
  await screenshot('em-settings-save-logs-modal');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Cancel' })
    .click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });

  // Set Date and Time.
  await screenshotWithButtonHighlight(
    'Set Date and Time',
    'em-settings-set-date-time-highlighted'
  );
  await page.getByRole('button', { name: 'Set Date and Time' }).click();
  await page.getByRole('alertdialog').waitFor();
  await screenshot('em-settings-set-date-time-modal');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Cancel' })
    .click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });

  // Signed Hash Validation. Generating the QR code shells out to `sudo` to hash
  // system state, which can't run in this environment (and a failure navigates
  // to a crash page), so mock the API response. Only `qrCodeInputs` is rendered
  // in the UI, so we give it representative values; the `qrCodeValue` itself
  // isn't meant to be scanned here (and the dev cert wouldn't validate anyway),
  // so it's just a random base64 blob of roughly representative length.
  await screenshotWithButtonHighlight(
    'Signed Hash Validation',
    'em-settings-signed-hash-validation-highlighted'
  );
  const systemHash = createHash('sha256')
    .update('vxprint-system-state')
    .digest('base64');
  const signedHashValidation: SignedHashValidationQrCodeValue = {
    qrCodeValue: pseudoRandomBase64('signed-hash-qr', 900),
    qrCodeInputs: {
      combinedElectionHash: electionDefinition.ballotHash.slice(0, 14),
      date: new Date('2026-06-09T19:00:00.000Z'),
      machineId: DEV_MACHINE_ID,
      softwareVersion: 'dev',
      systemHash,
    },
  };
  await page.route(
    '**/api/generateSignedHashValidationQrCodeValue',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        // Serialize with Grout so the tagged Date matches the real response.
        body: grout.serialize(signedHashValidation),
      });
    }
  );
  await page.getByRole('button', { name: 'Signed Hash Validation' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Done' })
    .waitFor();
  await screenshot('em-settings-signed-hash-validation-modal');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Done' })
    .click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  await page.unroute('**/api/generateSignedHashValidationQrCodeValue');

  // Diagnostics screen (full height — the readiness report content can exceed
  // the viewport, so grow the window to capture it all).
  await navigateTo(page, 'Diagnostics');
  await page.getByRole('heading', { name: 'Diagnostics' }).waitFor();
  await withContainerVerticallyExpanded('main', async () => {
    await screenshot('em-diagnostics-full');
  });

  // Save the readiness report to the USB drive (still inserted from
  // configuration), then capture the saved PDF.
  await page.getByRole('button', { name: 'Save Readiness Report' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Save' })
    .click();
  await page.getByText('Readiness Report Saved').waitFor();
  await captureReadinessReport('readiness-report', namer);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Close' })
    .click();

  // Election screen — unconfigure machine.
  await navigateTo(page, 'Election');
  await screenshotWithButtonHighlight(
    'Unconfigure Machine',
    'em-election-unconfigure-highlighted'
  );
  await page.getByRole('button', { name: 'Unconfigure Machine' }).click();
  await page.getByRole('alertdialog').waitFor();
  await screenshotWithButtonHighlight(
    'Delete All Election Data',
    'em-unconfigure-modal'
  );
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Cancel' })
    .click();
});

test('election manager: print screen options', async ({ page }, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  const electionDefinition = getElectionDefinition();
  const { election } = electionDefinition;
  const {
    screenshot,
    screenshotWithButtonHighlight,
    screenshotWithLocatorHighlight,
  } = buildIntegrationTestHelper(page, namer);
  const electionPackage = await buildElectionPackage(electionDefinition);
  const partyName = election.parties[0].name;

  await configureMachine(page, {
    election,
    electionPackage,
    pollingPlaceName: SPLIT_POLLING_PLACE,
  });

  // Print screen, fresh (no party/split selected yet).
  await navigateTo(page, 'Print');
  await page.getByRole('button', { name: 'Print Ballot' }).waitFor();
  await screenshot('em-print-no-selections');

  // Make selections: precinct, split, then party (language defaults to English).
  await page.getByRole('option', { name: 'Precinct 4', exact: true }).click();
  await page
    .getByRole('option', { name: 'Precinct 4 - Split 1', exact: true })
    .click();
  await page.getByRole('radio', { name: partyName }).click();
  await screenshot('em-print-with-selections');

  // Ballot type (absentee) toggle.
  await screenshotWithLocatorHighlight(
    page.getByText('Ballot Type:').locator('..'),
    'em-print-absentee-highlighted'
  );

  // Number of copies input.
  await screenshotWithLocatorHighlight(
    page.getByText('Copies:').locator('..'),
    'em-print-copies-highlighted'
  );

  // Print all ballot styles.
  await screenshotWithButtonHighlight(
    'Print All Ballot Styles',
    'em-print-all-ballot-styles-highlighted'
  );
  await page.getByRole('button', { name: 'Print All Ballot Styles' }).click();
  await page
    .getByRole('alertdialog')
    .getByText('Print All Ballot Styles')
    .waitFor();
  await screenshot('em-print-all-ballot-styles-modal');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Cancel' })
    .click();
});

test('poll worker: split precinct and reports', async ({ page }, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  const electionDefinition = getElectionDefinition();
  const { election } = electionDefinition;
  const { screenshot } = buildIntegrationTestHelper(page, namer);
  const electionPackage = await buildElectionPackage(electionDefinition);
  const partyName = election.parties[0].name;

  await configureMachine(page, {
    election,
    electionPackage,
    pollingPlaceName: SPLIT_POLLING_PLACE,
  });

  // Switch to poll worker.
  await logOut(page);
  await logInAsPollWorker(page, election);

  // Print screen, fresh.
  await page.getByRole('button', { name: 'Print Ballot' }).waitFor();
  await screenshot('pw-print-split-no-selections');

  // Make selections including a split.
  await page.getByText('Precinct 4 - Split 1', { exact: true }).click();
  await page.getByRole('radio', { name: partyName }).click();
  await screenshot('pw-print-split-with-selections');

  // Print a ballot and capture the progress modal.
  await page.getByRole('button', { name: 'Print Ballot' }).click();
  await page.getByRole('alertdialog').getByText('Printing').waitFor();
  await screenshot('pw-printing');
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });

  // Reports screen — full list.
  await navigateTo(page, 'Report');
  await page.getByRole('button', { name: 'Export Report PDF' }).waitFor();
  await screenshot('pw-report-full');

  // Filter the report by precinct name.
  await page
    .getByLabel('Filter table by precinct name')
    .fill(SPLIT_POLLING_PLACE);
  await screenshot('pw-report-filtered');
  await page.getByLabel('Filter table by precinct name').fill('');

  // Export the ballots printed report PDF and capture it.
  await page.getByRole('button', { name: 'Export Report PDF' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Export' })
    .click();
  await page.getByText('Ballots Printed Report Exported').waitFor();
  await capturePrintedBallotsReport('pw-ballots-printed-report', namer);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Close' })
    .click();
});

test('poll worker: precinct without splits', async ({ page }, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  const electionDefinition = getElectionDefinition();
  const { election } = electionDefinition;
  const { screenshot } = buildIntegrationTestHelper(page, namer);
  const electionPackage = await buildElectionPackage(electionDefinition);
  const partyName = election.parties[0].name;

  await configureMachine(page, {
    election,
    electionPackage,
    pollingPlaceName: NO_SPLIT_POLLING_PLACE,
  });

  await logOut(page);
  await logInAsPollWorker(page, election);

  // Print screen for a precinct without splits (no split section shown).
  await page.getByRole('button', { name: 'Print Ballot' }).waitFor();
  await page.getByRole('radio', { name: partyName }).click();
  await screenshot('pw-print-no-split-with-selections');
});

test('system administrator: settings', async ({ page }, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  const { screenshot } = buildIntegrationTestHelper(page, namer);

  await logInAsSystemAdministrator(page);
  await page.getByRole('button', { name: 'Unconfigure Machine' }).waitFor();
  await screenshot('sa-settings');
});
