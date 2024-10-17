import { expect, test } from '@playwright/test';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import {
  HP_LASER_PRINTER_CONFIG,
  getMockFilePrinterHandler,
} from '@votingworks/printing';
import {
  SCANNER_RESULTS_FOLDER,
  generateElectionBasedSubfolderName,
} from '@votingworks/utils';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  castVoteRecordExport,
} from '@votingworks/fixtures';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assert, assertDefined } from '@votingworks/basics';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  zipFile,
} from '@votingworks/test-utils';
import {
  constructElectionKey,
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

test.beforeEach(async ({ page }) => {
  await forceLogOutAndResetElectionDefinition(page);
  getMockFilePrinterHandler().cleanup();
  getMockFileUsbDriveHandler().cleanup();
});

test('walking through screens', async ({ page }) => {
  const usbHandler = getMockFileUsbDriveHandler();
  const printerHandler = getMockFilePrinterHandler();
  const { electionDefinition, castVoteRecordExport: testCastVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election, ballotHash, electionData } = electionDefinition;
  const electionPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionData,
  });
  const castVoteRecordExport = modifyCastVoteRecordExport(
    testCastVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordReportMetadataModifier: (castVoteRecordReportMetadata) => ({
        ...castVoteRecordReportMetadata,
        OtherReportType: undefined,
        ReportType: [CVR.ReportType.OriginatingDeviceExport],
      }),
    }
  );
  const electionPackageFileName = 'election-package.zip';
  await page.clock.install();

  await page.goto('/');
  await page.screenshot({
    path: './screenshots/machine-locked-unconfigured.png',
  });

  mockCard({
    cardStatus: {
      status: 'card_error',
    },
  });
  await expect(page.getByText('Card is Backwards')).toBeVisible();
  await page.screenshot({
    path: './screenshots/card-backwards.png',
  });

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
  await expect(page.getByText('Invalid Card')).toBeVisible();
  await page.screenshot({
    path: './screenshots/card-wrong-jurisdiction.png',
  });

  mockElectionManagerCardInsertion({ election });
  await expect(page.getByText(/machine is unconfigured/)).toBeVisible();
  await page.screenshot({
    path: './screenshots/card-election-manager-card-while-unconfigured.png',
  });

  mockPollWorkerCardInsertion({ election });
  await expect(
    page.getByText('Use a system administrator card.')
  ).toBeVisible();
  await page.screenshot({
    path: './screenshots/card-poll-worker-card.png',
  });

  mockSystemAdministratorCardInsertion();
  await expect(page.getByText('Enter the card PIN')).toBeVisible();
  await page.screenshot({
    path: './screenshots/enter-card-pin.png',
  });

  for (let i = 0; i < 6; i += 1) {
    await page.getByText('0').click();
  }
  await expect(page.getByText(/unlock/)).toBeVisible();
  await page.screenshot({
    path: './screenshots/remove-card-to-unlock.png',
  });

  mockCardRemoval();
  await expect(page.getByText(/Insert a USB drive/)).toBeVisible();
  await page.screenshot({
    path: './screenshots/system-administrator-election-screen-unconfigured.png',
  });

  usbHandler.insert({
    [electionPackageFileName]: electionPackage,
  });
  await expect(page.getByText(/Select an election package/)).toBeVisible();
  await page.screenshot({
    path: './screenshots/system-administrator-election-screen-select-election-package.png',
  });

  await page.getByText(electionPackageFileName).click();
  await expect(
    page.getByRole('heading', { name: election.title })
  ).toBeVisible();
  await page.screenshot({
    path: './screenshots/system-administrator-election-screen-configured.png',
  });

  usbHandler.remove();
  await page.getByText('Save Election Package').click();
  await expect(
    page.getByRole('heading', { name: 'No USB Drive Detected' })
  ).toBeVisible();
  await page.screenshot({
    path: './screenshots/save-election-package-no-usb-drive.png',
  });

  usbHandler.insert();
  await expect(
    page.getByRole('heading', { name: 'Save Election Package' })
  ).toBeVisible();
  await page.screenshot({
    path: './screenshots/save-election-package.png',
  });

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(
    page.getByRole('heading', { name: 'Election Package Saved' })
  ).toBeVisible();
  await page.screenshot({
    path: './screenshots/election-package-saved.png',
  });
  await page.getByText('Close').click();

  await page.getByText('Settings').click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.screenshot({
    path: './screenshots/system-administrator-settings-screen.png',
  });

  await page.getByText('Save Log File').click();
  await expect(page.getByRole('heading', { name: 'Save Logs' })).toBeVisible();
  await page.screenshot({
    path: './screenshots/save-logs.png',
  });

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Logs Saved' })).toBeVisible();
  await page.screenshot({
    path: './screenshots/logs-saved.png',
  });
  await page.getByText('Close').click();

  await page.getByText('Set Date and Time').click();
  await expect(
    page.getByRole('heading', { name: 'Set Date and Time' })
  ).toBeVisible();
  await page.screenshot({
    path: './screenshots/set-date-and-time.png',
  });
  await page.getByText('Cancel').click();

  await page.getByText('Format USB Drive').click();
  await expect(
    page.getByRole('heading', { name: 'Format USB Drive' })
  ).toBeVisible();
  await page.screenshot({
    path: './screenshots/format-usb-drive.png',
  });

  await page.getByRole('button', { name: 'Format USB Drive' }).click();
  await expect(
    page.getByRole('heading', { name: 'USB Drive Formatted' })
  ).toBeVisible();
  await page.screenshot({
    path: './screenshots/usb-drive-formatted.png',
  });
  await page.getByText('Close').click();

  // formatting ejects the USB drive
  usbHandler.remove();
  usbHandler.insert();

  await page.getByRole('button', { name: 'Signed Hash Validation' }).click();
  await expect(page.getByText(/Scan this QR code/)).toBeVisible();
  await page.screenshot({
    path: './screenshots/signed-hash-validation.png',
  });
  await page.getByText('Done').click();

  printerHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  await page.getByText('Diagnostics').click();
  await expect(
    page.getByRole('heading', { name: 'Diagnostics' })
  ).toBeVisible();
  await page.screenshot({
    path: './screenshots/diagnostics-screen.png',
  });

  await page.getByRole('button', { name: 'Print Test Page' }).click();
  await page.clock.fastForward(7000);
  await expect(page.getByText('Test Page Printed')).toBeVisible();
  await page.screenshot({
    path: './screenshots/test-page-printed.png',
  });
  await page.getByText('Cancel').click();

  await page.getByRole('button', { name: 'Save Readiness Report' }).click();
  await expect(
    page.getByRole('heading', { name: 'Save Readiness Report' })
  ).toBeVisible();
  await page.screenshot({
    path: './screenshots/save-readiness-report.png',
  });

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(
    page.getByRole('heading', { name: 'Readiness Report Saved' })
  ).toBeVisible();
  await page.screenshot({
    path: './screenshots/readiness-report-saved.png',
  });
  await page.getByRole('button', { name: 'Close' }).click();

  // there are some limitations on the card programming we can mock
  await page.getByText('Smart Cards').click();
  await expect(
    page.getByRole('heading', { name: 'Smart Cards' })
  ).toBeVisible();
  await page.screenshot({
    path: './screenshots/smart-cards-screen.png',
  });

  mockCard({
    cardStatus: {
      status: 'card_error',
    },
  });
  await expect(page.getByText('Card is Backwards')).toBeVisible();
  await page.screenshot({
    path: './screenshots/programming-card-backwards.png',
  });

  mockCard({
    cardStatus: {
      status: 'ready',
    },
  });
  await expect(page.getByText('Blank Card')).toBeVisible();
  await page.screenshot({
    path: './screenshots/smart-cards-programming-blank-card.png',
  });
  mockCardRemoval();

  await page.getByRole('button', { name: 'Lock Machine' }).click();
  await expect(page.getByText('VxAdmin Locked')).toBeVisible();
  await logInAsElectionManager(page, election);
  await expect(page.getByText('Lock Machine')).toBeVisible();
  await page.screenshot({
    path: './screenshots/election-manager-election-screen.png',
  });

  await page.getByText('Tally').click();
  await expect(page.getByRole('heading', { name: 'Tally' })).toBeVisible();
  await page.screenshot({
    path: './screenshots/tally-screen-empty.png',
  });
});
