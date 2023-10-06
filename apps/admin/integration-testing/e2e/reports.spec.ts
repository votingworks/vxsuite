import { expect, test } from '@playwright/test';
import { tmpNameSync } from 'tmp';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import {
  SCANNER_RESULTS_FOLDER,
  generateElectionBasedSubfolderName,
} from '@votingworks/utils';
import {
  electionTwoPartyPrimaryDefinition,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { assertDefined } from '@votingworks/basics';
import {
  forceLogOutAndResetElectionDefinition,
  logInAsElectionManager,
  logInAsSystemAdministrator,
  logOut,
} from './support/auth';

test.beforeEach(async ({ page }) => {
  await forceLogOutAndResetElectionDefinition(page);
});

function asFilePath(data: string): string {
  const filePath = tmpNameSync();
  writeFileSync(filePath, data);
  return filePath;
}

test('viewing and exporting reports', async ({ page }) => {
  const usbHandler = getMockFileUsbDriveHandler();
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  const { election, electionHash, electionData } = electionDefinition;

  await page.goto('/');

  // load election definition as system administrator
  await logInAsSystemAdministrator(page);
  await page
    .getByLabel('Select Existing Election Definition File')
    .setInputFiles(asFilePath(electionData));
  expect(page);
  await logOut(page);

  await logInAsElectionManager(page, electionHash);
  await page.getByText('Tally').click();
  await expect(
    page.getByText('Cast Vote Record (CVR) Management')
  ).toBeVisible();

  const electionDirectory = generateElectionBasedSubfolderName(
    election,
    electionHash
  );
  const testReportDirectoryName =
    'TEST__machine_VX-00-000__2023-08-16_17-02-24';
  const testReportDirectoryPath =
    electionTwoPartyPrimaryFixtures.castVoteRecordExport.asDirectoryPath();
  usbHandler.insert({
    [SCANNER_RESULTS_FOLDER]: {
      [electionDirectory]: {
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

  await page.getByText('Reports', { exact: true }).click();
  await expect(page.getByText('Unofficial Tally Reports')).toBeVisible();
  await page.getByText('Full Election Tally Report').click();

  // Check Preview
  const reportTitles = [
    'Unofficial Mammal Party Example Primary Election Tally Report',
    'Unofficial Fish Party Example Primary Election Tally Report',
    'Unofficial Example Primary Election Nonpartisan Contests Tally Report',
  ];
  for (const title of reportTitles) {
    await expect(page.getByText(title)).toBeVisible();
  }
  await expect(page.getByTestId('total-ballot-count').first()).toHaveText('56');
  await expect(page.getByTestId('total-ballot-count').last()).toHaveText('112');

  // Check CSV Export
  await page.getByRole('button', { name: 'Export Report CSV' }).click();
  await page.getByText('Save Results').waitFor();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Results Saved').waitFor();
  await page.getByRole('button', { name: 'Close' }).click();

  const exportedReportDirectory = join(
    assertDefined(usbHandler.getMountPoint()),
    electionDirectory,
    'reports'
  );
  const exportedReportFilename = readdirSync(exportedReportDirectory)[0];
  expect(
    readFileSync(join(exportedReportDirectory, exportedReportFilename))
  ).toMatchSnapshot();

  // Mark Official
  await page
    .getByRole('button', { name: 'Mark Tally Results as Official' })
    .click();
  await page
    .getByRole('alertdialog')
    .locator(
      page.getByRole('button', { name: 'Mark Tally Results as Official' })
    )
    .click();

  await expect(
    page.getByRole('button', { name: 'Mark Tally Results as Official' })
  ).toBeDisabled();
  await page
    .getByText('Official Mammal Party Example Primary Election Tally Report')
    .waitFor();

  await page.getByText('Tally', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load CVRs' })).toBeDisabled();
});
