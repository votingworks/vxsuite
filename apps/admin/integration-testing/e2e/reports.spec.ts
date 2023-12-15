import { expect, test } from '@playwright/test';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import {
  SCANNER_RESULTS_FOLDER,
  generateElectionBasedSubfolderName,
} from '@votingworks/utils';
import {
  electionTwoPartyPrimaryDefinition,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { assertDefined } from '@votingworks/basics';
import { zipFile } from '@votingworks/test-utils';
import { ElectionPackageFileName } from '@votingworks/types';
import {
  forceLogOutAndResetElectionDefinition,
  logInAsElectionManager,
  logInAsSystemAdministrator,
  logOut,
} from './support/auth';

test.beforeEach(async ({ page }) => {
  await forceLogOutAndResetElectionDefinition(page);
});

test('viewing and exporting reports', async ({ page }) => {
  const usbHandler = getMockFileUsbDriveHandler();
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  const { election, electionHash, electionData } = electionDefinition;
  const electionPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionData,
  });
  const electionPackageFileName = 'election-package.zip';

  await page.goto('/');

  // load election definition as system administrator
  await logInAsSystemAdministrator(page);
  usbHandler.insert({
    [electionPackageFileName]: electionPackage,
  });

  await page.getByText(electionPackageFileName).click();
  await expect(
    page.getByRole('heading', { name: election.title })
  ).toBeVisible();
  await logOut(page);

  await logInAsElectionManager(page, electionHash);
  await page.getByText('Tally').click();
  await expect(page.getByText('Cast Vote Records (CVRs)')).toBeVisible();

  const electionDirectory = generateElectionBasedSubfolderName(
    election,
    electionHash
  );
  const testReportDirectoryName =
    'TEST__machine_VX-00-000__2023-08-16_17-02-24';
  const testReportDirectoryPath =
    electionTwoPartyPrimaryFixtures.castVoteRecordExport.asDirectoryPath();
  usbHandler.insert({
    [electionDirectory]: {
      [SCANNER_RESULTS_FOLDER]: {
        [testReportDirectoryName]: testReportDirectoryPath,
      },
    },
  });
  await page.getByText('Eject USB').waitFor();

  await page.getByRole('button', { name: 'Load CVRs' }).click();
  await expect(page.getByText('112')).toBeVisible();
  await expect(page.getByText('VX-00-000')).toBeVisible();
  await page.getByRole('button', { name: 'Load' }).click();
  await page.getByText('112 New CVRs Loaded').waitFor();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('total-cvr-count')).toHaveText('112');

  await page.getByRole('button', { name: 'Reports' }).click();
  await expect(page.getByText('Unofficial Tally Reports')).toBeVisible();
  await page.getByText('Full Election Tally Report').click();

  // Check Preview
  const reportTitles = [
    ['Unofficial Mammal Party Example Primary Election Tally Report', '56'],
    ['Unofficial Fish Party Example Primary Election Tally Report', '56'],
    [
      'Unofficial Example Primary Election Nonpartisan Contests Tally Report',
      '112',
    ],
  ];
  for (const [title, totalBallotCount] of reportTitles) {
    const section = page.locator('section', { hasText: title });
    await expect(section).toBeVisible();
    await expect(section.getByTestId('total-ballot-count')).toHaveText(
      totalBallotCount
    );
  }

  // Check CSV Export
  await page.getByRole('button', { name: 'Export Report CSV' }).click();
  await page.getByText('Save Results').waitFor();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Results Saved').waitFor();
  await page.getByRole('button', { name: 'Close' }).click();

  const exportedReportDirectory = join(
    assertDefined(usbHandler.getDataPath()),
    electionDirectory,
    'reports'
  );
  const exportedReportFilename = readdirSync(exportedReportDirectory)[0];
  expect(
    readFileSync(join(exportedReportDirectory, exportedReportFilename))
  ).toMatchSnapshot();

  // Mark Official
  await page.getByRole('button', { name: 'Reports' }).click();
  await page
    .getByRole('button', { name: 'Mark Election Results as Official' })
    .click();
  await page
    .getByRole('alertdialog')
    .locator(
      page.getByRole('button', { name: 'Mark Election Results as Official' })
    )
    .click();

  // Check Official
  await expect(
    page.getByRole('button', { name: 'Mark Election Results as Official' })
  ).toBeDisabled();
  await expect(page.getByText('Official Tally Reports')).toBeVisible();

  await page.getByText('Full Election Tally Report').click();
  await page
    .getByText('Official Mammal Party Example Primary Election Tally Report')
    .waitFor();

  await page.getByText('Tally', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load CVRs' })).toBeDisabled();
});
