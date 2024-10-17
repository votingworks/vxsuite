import { expect, Page, PageScreenshotOptions, test } from '@playwright/test';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import {
  HP_LASER_PRINTER_CONFIG,
  getMockFilePrinterHandler,
} from '@votingworks/printing';
import {
  SCANNER_RESULTS_FOLDER,
  generateElectionBasedSubfolderName,
} from '@votingworks/utils';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assert, assertDefined, sleep } from '@votingworks/basics';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  zipFile,
} from '@votingworks/test-utils';
import {
  constructElectionKey,
  ContestIdSchema,
  CVR,
  ElectionPackageFileName,
} from '@votingworks/types';
import {
  DEV_JURISDICTION,
  mockCard,
  mockCardRemoval,
  mockElectionManagerCardInsertion,
  mockPollWorkerCardInsertion,
  mockSystemAdministratorCardInsertion,
} from '@votingworks/auth';
import { unzip } from 'node:zlib';
import { modifyCastVoteRecordExport } from '@votingworks/backend';
import { writeFile } from 'node:fs/promises';
import {
  forceLogOutAndResetElectionDefinition,
  logInAsElectionManager,
  logInAsSystemAdministrator,
  logOut,
} from './support/auth';
import {
  PAGE_SCROLL_DELTA_Y,
  pdfToText,
  replaceLineBreaks,
  replaceReportDates,
} from './support/pdf';

async function openDropdown(page: Page, ariaLabel: string) {
  const input = page.locator(`[aria-label="${ariaLabel}"]`);
  await input.locator('..').click();
  await page.getByRole('combobox', { expanded: true }).waitFor();
}

async function selectOpenDropdownOption(page: Page, optionLabel: string) {
  await page
    .locator('.search-select')
    .filter({ has: page.getByRole('combobox', { expanded: true }) })
    .getByText(optionLabel, { exact: true })
    .click();
}

test.beforeEach(async ({ page }) => {
  await forceLogOutAndResetElectionDefinition(page);
  getMockFilePrinterHandler().cleanup();
  getMockFileUsbDriveHandler().cleanup();
});

test('system administrator', async ({ page }) => {
  const usbHandler = getMockFileUsbDriveHandler();
  const printerHandler = getMockFilePrinterHandler();
  const { electionDefinition } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election, electionData } = electionDefinition;
  const electionPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionData,
  });

  const electionPackageFileName = 'election-package.zip';
  await page.clock.install();

  async function screenshot(name: string, args: PageScreenshotOptions = {}) {
    await page.screenshot({
      ...args,
      animations: 'disabled',
      path: `./screenshots/sys-admin/${name}.png`,
    });
  }

  await page.goto('/');
  await screenshot('machine-locked-unconfigured');

  mockCard({
    cardStatus: {
      status: 'card_error',
    },
  });
  await page.getByText('Card is Backwards').waitFor();
  await screenshot('card-backwards');

  mockCard({
    cardStatus: {
      status: 'ready',
      cardDetails: {
        user: {
          role: 'system_administrator',
          jurisdiction: 'wrong.jurisdiction',
        },
      },
    },
  });
  await page.getByText('Invalid Card').waitFor();
  await screenshot('card-wrong-jurisdiction');

  mockElectionManagerCardInsertion({ election });
  await page.getByText(/machine is unconfigured/).waitFor();
  await screenshot('card-election-manager-card-while-unconfigured');

  mockPollWorkerCardInsertion({ election });
  await page.getByText('Use a system administrator card.').waitFor();
  await screenshot('card-poll-worker-card');

  mockSystemAdministratorCardInsertion();
  await page.getByText('Enter the card PIN').waitFor();
  await screenshot('enter-card-pin');

  for (let i = 0; i < 6; i += 1) {
    await page.getByText('0').click();
  }
  await page.getByText(/unlock/).waitFor();
  await screenshot('remove-card-to-unlock');

  mockCardRemoval();
  await page.getByText(/Insert a USB drive/).waitFor();
  await screenshot('election-screen-unconfigured');

  usbHandler.insert({
    [electionPackageFileName]: electionPackage,
  });
  await page.getByText(/Select an election package/).waitFor();
  await screenshot('election-screen-select-election-package');

  await page.getByText(electionPackageFileName).click();
  await page.getByRole('heading', { name: election.title }).waitFor();
  await screenshot('election-screen-configured');

  usbHandler.remove();
  await page.getByText('Save Election Package').click();
  await page.getByRole('heading', { name: 'No USB Drive Detected' }).waitFor();
  await screenshot('save-election-package-no-usb-drive');

  usbHandler.insert();
  await page.getByRole('heading', { name: 'Save Election Package' }).waitFor();
  await screenshot('save-election-package');

  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('heading', { name: 'Election Package Saved' }).waitFor();
  await screenshot('election-package-saved');
  await page.getByText('Close').click();

  await page.getByText('Settings').click();
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await screenshot('settings-screen');

  await page.getByText('Save Log File').click();
  await page.getByRole('heading', { name: 'Save Logs' }).waitFor();
  await screenshot('save-logs');

  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('heading', { name: 'Logs Saved' }).waitFor();
  await screenshot('logs-saved');
  await page.getByText('Close').click();

  await page.getByText('Set Date and Time').click();
  await page.getByRole('heading', { name: 'Set Date and Time' }).waitFor();
  await screenshot('set-date-and-time');
  await page.getByText('Cancel').click();

  await page.getByText('Format USB Drive').click();
  await page.getByRole('heading', { name: 'Format USB Drive' }).waitFor();
  await screenshot('format-usb-drive');

  await page.getByRole('button', { name: 'Format USB Drive' }).click();
  await page.getByRole('heading', { name: 'USB Drive Formatted' }).waitFor();
  await screenshot('usb-drive-formatted');
  await page.getByText('Close').click();

  // formatting ejects the USB drive
  usbHandler.remove();
  usbHandler.insert();

  await page.getByRole('button', { name: 'Signed Hash Validation' }).click();
  await page.getByText(/Scan this QR code/).waitFor();
  await screenshot('signed-hash-validation');
  await page.getByText('Done').click();

  printerHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  await page.getByText('Diagnostics').click();
  await page.getByRole('heading', { name: 'Diagnostics' }).waitFor();
  await screenshot('diagnostics-screen');

  await page.getByRole('button', { name: 'Print Test Page' }).click();
  await page.clock.fastForward(7000);
  await page.getByText('Test Page Printed').waitFor();
  await screenshot('test-page-printed');
  await page.getByText('Cancel').click();

  await page.getByRole('button', { name: 'Save Readiness Report' }).click();
  await page.getByRole('heading', { name: 'Save Readiness Report' }).waitFor();
  await screenshot('save-readiness-report');

  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('heading', { name: 'Readiness Report Saved' }).waitFor();
  await screenshot('readiness-report-saved');
  await page.getByRole('button', { name: 'Close' }).click();

  // there are some limitations on the card programming we can mock
  await page.getByText('Smart Cards').click();
  await page.getByRole('heading', { name: 'Smart Cards' }).waitFor();
  await screenshot('smart-cards-screen');

  mockCard({
    cardStatus: {
      status: 'card_error',
    },
  });
  await page.getByText('Card is Backwards').waitFor();
  await screenshot('programming-card-backwards');

  mockCard({
    cardStatus: {
      status: 'ready',
    },
  });
  await page.getByText('Blank Card').waitFor();
  await screenshot('smart-cards-programming-blank-card');

  await page.getByText('Election', { exact: true }).click();
  await page.getByRole('heading', { name: 'Election', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Unconfigure Machine' }).click();
  await page.getByRole('heading', { name: 'Unconfigure Machine' }).waitFor();
  await screenshot('unconfigure-machine');

  await page.getByRole('button', { name: 'Delete All Election Data' }).click();
  await page.getByText(/Select an election package/).waitFor();
});

test.only('tallying', async ({ page }) => {
  const usbHandler = getMockFileUsbDriveHandler();
  const printerHandler = getMockFilePrinterHandler();
  const { electionDefinition, castVoteRecordExport: testCastVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election, ballotHash, electionData } = electionDefinition;
  const electionPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionData,
  });
  const electionPackageFileName = 'election-package.zip';

  const castVoteRecordExport = await modifyCastVoteRecordExport(
    testCastVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordReportMetadataModifier: (castVoteRecordReportMetadata) => ({
        ...castVoteRecordReportMetadata,
        OtherReportType: undefined,
        ReportType: [CVR.ReportType.OriginatingDeviceExport],
      }),
    }
  );

  async function screenshot(name: string, args: PageScreenshotOptions = {}) {
    await page.screenshot({
      ...args,
      animations: 'disabled',
      path: `./screenshots/tallying/${name}.png`,
    });
  }

  await page.goto('/');

  // load election definition as system administrator
  await logInAsSystemAdministrator(page);
  usbHandler.insert({
    [electionPackageFileName]: electionPackage,
  });

  await page.getByText(electionPackageFileName).click();
  await page.getByRole('heading', { name: election.title }).waitFor();
  await logOut(page);

  await logInAsElectionManager(page, election);
  await page.getByRole('heading', { name: 'Election', exact: true }).waitFor();
  await screenshot('election-screen');

  await page.getByText('Tally').click();
  await page.getByText('Cast Vote Records (CVRs)').waitFor();
  await screenshot('tally-screen-empty');

  const electionDirectory = generateElectionBasedSubfolderName(
    election,
    ballotHash
  );
  const testReportDirectoryName = 'machine_VX-00-000__2023-08-16_17-02-24';
  usbHandler.insert({
    [electionDirectory]: {
      [SCANNER_RESULTS_FOLDER]: {
        [testReportDirectoryName]: castVoteRecordExport,
      },
    },
  });
  await page.getByText('Load CVRs').click();
  await page.getByText('184').waitFor();
  await screenshot('load-cvrs');

  await page.getByRole('button', { name: 'Load' }).click();
  await page.getByText('184 New CVRs Loaded').waitFor();
  await screenshot('cvrs-loaded-modal');

  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByText('Total CVR Count: 184').waitFor();
  await screenshot('tally-screen-loaded');

  await page.getByText('Write-Ins').click();
  await page.getByText('Write-In Adjudication').waitFor();
  await screenshot('write-in-screen-pre-adjudication');

  await page.getByText('Reports').click();
  await page.getByText('Unofficial Tally Reports').waitFor();
  await screenshot('reports-screen-unofficial');

  await page
    .getByRole('button', { name: 'Full Election Tally Report' })
    .click();
  await page
    .getByRole('heading', { name: 'Full Election Tally Report' })
    .waitFor();
  await screenshot('full-election-report-unofficial');

  await page.getByRole('button', { name: 'Reports' }).click();
  await page.reload(); // reload so full election report isn't cached for tally builder
  await page.getByRole('button', { name: 'Tally Report Builder' }).click();
  await page.getByRole('heading', { name: 'Tally Report Builder' }).waitFor();
  await screenshot('tally-report-builder-initial');

  await page.getByText('Add Filter').click();
  await openDropdown(page, 'Select New Filter Type');
  await screenshot('tally-report-builder-filter-selection');

  await selectOpenDropdownOption(page, 'Precinct');
  await openDropdown(page, 'Select Filter Values');
  await screenshot('tally-report-builder-filter-value-selection');

  await page.getByRole('combobox', { expanded: true }).waitFor();
  await selectOpenDropdownOption(page, 'Test Ballot');
  await page.getByText('Voting Method').check();
  await screenshot('tally-report-builder-group-selected');

  await page.getByRole('button', { name: 'Generate Report' }).click();
  await page.getByText(/Page:/).waitFor();
  await screenshot('tally-report-builder-done');

  await page.getByRole('button', { name: 'Reports' }).click();
  await page.getByText('Voting Method Ballot Count Report').click();
  await page
    .getByRole('heading', { name: 'Voting Method Ballot Count Report' })
    .waitFor();
  await page.getByText(/Page:/).waitFor();
  await screenshot('ballot-count-report-voting-method');

  await page.getByRole('button', { name: 'Reports' }).click();
  await page.getByText('Unofficial Write-In Adjudication Report').click();
  await page
    .getByRole('heading', { name: 'Write-In Adjudication Report' })
    .waitFor();
  await page.getByText(/Page:/).waitFor();
  await screenshot('write-in-adjudication-report');

  await page.getByRole('button', { name: 'Reports' }).click();
  await page.getByText('Mark Election Results as Official').click();
  await page.getByRole('alertdialog').waitFor();
  await screenshot('mark-as-official-modal');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Mark Election Results as Official' })
    .click();

  await page.getByText('Election Results are Official').waitFor();
  await screenshot('reports-screen-official');

  await page.getByRole('button', { name: 'Tally', exact: true }).click();
  await page.getByText('Cast Vote Records (CVRs)').waitFor();
  await screenshot('tally-screen-official');
});
