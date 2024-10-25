import { expect, Page, PageScreenshotOptions, test } from '@playwright/test';
import {
  getMockFileUsbDriveHandler,
  MockFileUsbDriveHandler,
} from '@votingworks/usb-drive';
import {
  HP_LASER_PRINTER_CONFIG,
  getMockFilePrinterHandler,
  MockFilePrinterHandler,
} from '@votingworks/printing';
import {
  SCANNER_RESULTS_FOLDER,
  generateElectionBasedSubfolderName,
} from '@votingworks/utils';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
} from '@votingworks/fixtures';
import { assertDefined } from '@votingworks/basics';
import { zipFile } from '@votingworks/test-utils';
import {
  CVR,
  ElectionDefinition,
  ElectionPackageFileName,
} from '@votingworks/types';
import {
  mockBlankCard,
  mockCardRemoval,
  mockElectionManagerCardInsertion,
  mockPollWorkerCardInsertion,
  mockSystemAdministratorCardInsertion,
} from '@votingworks/auth';
import { modifyCastVoteRecordExport } from '@votingworks/backend';
import { copyFile, mkdir } from 'node:fs/promises';
import {
  forceLogOutAndResetElectionDefinition,
  logInAsElectionManager,
  logInAsSystemAdministrator,
  logOut,
} from './support/auth';
import {
  getAdjudicateButtons,
  markUndervote,
  selectCandidate,
  WRITE_IN_NAMES,
} from './support/write_in_adjudication';
import {
  getPrimaryButton,
  openDropdown,
  selectOpenDropdownOption,
  waitForReportToLoad,
} from './support/navigation';

function makeScreenshotHelpers(page: Page, dir: string) {
  async function screenshot(name: string, args: PageScreenshotOptions = {}) {
    await page.screenshot({
      ...args,
      animations: 'disabled',
      path: `./test-results/screenshots/${dir}/${name}.png`,
    });
  }

  async function screenshotModal(
    name: string,
    args: PageScreenshotOptions = {}
  ) {
    await page.getByRole('alertdialog').screenshot({
      ...args,
      animations: 'disabled',
      path: `./test-results/screenshots/${dir}/${name}.png`,
    });
  }

  return { screenshot, screenshotModal };
}

async function printAndSaveReport({
  page,
  printerHandler,
  dir,
  filename,
}: {
  page: Page;
  printerHandler: MockFilePrinterHandler;
  dir: string;
  filename: string;
}) {
  await page.getByText('Print Report').click();
  await page.getByText('Printing').waitFor();
  await page.clock.fastForward(3000);
  await expect(page.getByText('Printing')).toHaveCount(0);

  const lastPrintPath = printerHandler.getLastPrintPath();
  await copyFile(
    assertDefined(lastPrintPath),
    `./test-results/screenshots/${dir}/${filename}`
  );
}

test.beforeEach(async ({ page }) => {
  await forceLogOutAndResetElectionDefinition(page);
  getMockFilePrinterHandler().cleanup();
  getMockFileUsbDriveHandler().cleanup();
  await page.clock.install();
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

  const { screenshot } = makeScreenshotHelpers(page, 'sys-admin');

  await page.goto('/');
  await screenshot('machine-locked-unconfigured');

  mockSystemAdministratorCardInsertion();
  await page.getByText('Enter Card PIN').waitFor();
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

  await page.getByText('Save Election Package').click();
  await page.getByRole('heading', { name: 'Save Election Package' }).waitFor();
  await screenshot('save-election-package');

  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('heading', { name: 'Election Package Saved' }).waitFor();
  await screenshot('election-package-saved');
  await page.getByText('Close').click();

  await page.getByText('Smart Cards').click();
  await page.getByRole('heading', { name: 'Smart Cards' }).waitFor();
  await screenshot('smart-cards-screen');

  async function removeCard() {
    mockCardRemoval();
    await page.getByText('Insert a smart card', { exact: true }).waitFor();
  }

  mockBlankCard();
  await page.getByText('Blank Card').waitFor();
  await screenshot('smart-cards-blank');

  // program SA card
  await removeCard();
  mockBlankCard();
  await page.getByText('Blank Card').waitFor();
  await page.getByText('Program System Administrator Card').click();
  await screenshot('smart-cards-sa-confirm');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Program System Administrator Card' })
    .click();
  await page.getByText('System Administrator Card', { exact: true }).waitFor();
  await screenshot('smart-cards-sa-programmed');
  await removeCard();

  // reset PIN on SA card
  mockSystemAdministratorCardInsertion();
  await page.getByText('System Administrator Card', { exact: true }).waitFor();
  await screenshot('smart-cards-sa-existing');
  await page.getByText('Reset Card PIN').click();
  await screenshot('smart-cards-sa-pin-reset-confirm');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Reset System Administrator Card PIN' })
    .click();
  await screenshot('smart-cards-sa-pin-reset');
  await removeCard();

  // program EM card
  mockBlankCard();
  await page.getByText('Program Election Manager Card').click();
  await page.getByText('Election Manager Card', { exact: true }).waitFor();
  await screenshot('smart-cards-em-programmed');
  await removeCard();

  // insert existing EM card
  mockElectionManagerCardInsertion({ election });
  await page.getByText('Election Manager Card', { exact: true }).waitFor();
  await screenshot('smart-cards-em-existing');
  await removeCard();

  // insert EM card for wrong election
  mockElectionManagerCardInsertion({
    election: electionFamousNames2021Fixtures.election,
  });
  await page.getByText('Election Manager Card', { exact: true }).waitFor();
  await screenshot('smart-cards-em-wrong-election');
  await removeCard();

  // program PW card
  mockBlankCard();
  await page.getByText('Blank Card').waitFor();
  await page.getByText('Program Poll Worker Card').click();
  await page.getByText('Poll Worker Card', { exact: true }).waitFor();
  await screenshot('smart-cards-pw-programmed');
  await removeCard();

  // insert existing PW card
  mockPollWorkerCardInsertion({ election });
  await page.getByText('Poll Worker Card', { exact: true }).waitFor();
  await screenshot('smart-cards-pw-existing');
  await removeCard();

  // insert PW card for wrong election
  mockPollWorkerCardInsertion({
    election: electionFamousNames2021Fixtures.election,
  });
  await page.getByText('Poll Worker Card', { exact: true }).waitFor();
  await screenshot('smart-cards-pw-wrong-election');
  await removeCard();

  await page.getByText('Settings').click();
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await screenshot('settings-screen');

  // app must find a logs dir for saving logs to be successful
  await mkdir('/var/log/votingworks', { recursive: true });
  await page.getByText('Save Logs').click();
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

  // formatting ejects the USB drive, so we need to re-insert
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
  await page.clock.fastForward(3000);
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

  await page.getByText('Election', { exact: true }).click();
  await page.getByRole('heading', { name: 'Election', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Unconfigure Machine' }).click();
  await page.getByRole('heading', { name: 'Unconfigure Machine' }).waitFor();
  await screenshot('unconfigure-machine');

  await page.getByRole('button', { name: 'Delete All Election Data' }).click();
  await page.getByText(/Select an election package/).waitFor();
});

async function configureMachine({
  page,
  usbHandler,
  electionDefinition,
}: {
  page: Page;
  usbHandler: MockFileUsbDriveHandler;
  electionDefinition: ElectionDefinition;
}): Promise<void> {
  const { election, electionData } = electionDefinition;
  const electionPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionData,
  });
  const electionPackageFileName = 'election-package.zip';

  await logInAsSystemAdministrator(page);
  usbHandler.insert({
    [electionPackageFileName]: electionPackage,
  });
  await page.getByText(electionPackageFileName).click();
  await page.getByRole('heading', { name: election.title }).waitFor();
  await logOut(page);
}

async function insertUsbDriveWithCvrs({
  cvrPath: cvrPathFromProps,
  convertToOfficial,
  usbHandler,
  electionDefinition,
}: {
  cvrPath: string;
  convertToOfficial: boolean;
  usbHandler: MockFileUsbDriveHandler;
  electionDefinition: ElectionDefinition;
}): Promise<void> {
  const cvrPath = !convertToOfficial
    ? cvrPathFromProps
    : await modifyCastVoteRecordExport(cvrPathFromProps, {
        castVoteRecordReportMetadataModifier: (
          castVoteRecordReportMetadata
        ) => ({
          ...castVoteRecordReportMetadata,
          OtherReportType: undefined,
          ReportType: [CVR.ReportType.OriginatingDeviceExport],
        }),
      });

  const { election, ballotHash } = electionDefinition;
  const electionDirectory = generateElectionBasedSubfolderName(
    election,
    ballotHash
  );
  const testReportDirectoryName = 'machine_VX-00-000__2023-08-16_17-02-24';
  usbHandler.insert({
    [electionDirectory]: {
      [SCANNER_RESULTS_FOLDER]: {
        [testReportDirectoryName]: cvrPath,
      },
    },
  });
}

test('results', async ({ page }) => {
  const usbHandler = getMockFileUsbDriveHandler();
  const printerHandler = getMockFilePrinterHandler();
  printerHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;

  const { screenshot } = makeScreenshotHelpers(page, 'results');

  await page.goto('/');
  await configureMachine({
    page,
    usbHandler,
    electionDefinition,
  });

  await logInAsElectionManager(page, election);
  await page.getByRole('heading', { name: 'Election', exact: true }).waitFor();
  await screenshot('election-screen');

  await page.getByText('Tally').click();
  await page.getByText('Cast Vote Records (CVRs)').waitFor();
  await screenshot('tally-screen-empty');

  await insertUsbDriveWithCvrs({
    cvrPath: castVoteRecordExport.asDirectoryPath(),
    convertToOfficial: true,
    usbHandler,
    electionDefinition,
  });
  await page.getByText('Load CVRs').click();
  await page.getByText('184').waitFor();
  await screenshot('load-cvrs');

  await page.getByRole('button', { name: 'Load' }).click();
  await page.getByText('184 New CVRs Loaded').waitFor();
  await screenshot('cvrs-loaded');

  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByText('Total CVR Count: 184').waitFor();
  await screenshot('tally-screen-with-cvrs');

  await page.getByText('Write-Ins').click();
  await page.getByText('Write-In Adjudication').waitFor();
  await screenshot('write-in-screen-pre-adjudication');

  // iterate through all the adjudication queues
  const numWriteInContests = await getAdjudicateButtons(page).count();
  for (
    let contestIndex = 0;
    contestIndex < numWriteInContests;
    contestIndex += 1
  ) {
    await getAdjudicateButtons(page).first().click();

    let hasFinishedWriteInsForContest = false;
    let writeInIndex = 0;
    while (!hasFinishedWriteInsForContest) {
      // There is occasional flakiness because the write-in adjudication screen
      // is still rendering and the button press doesn't always register.
      // Zooming out, by acting as a delay, seems to avoid the problem.
      await page.getByText('Zoom Out').click();

      // uneven but deterministic strategy for making adjudications
      switch (writeInIndex % 8) {
        case 0:
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          await selectCandidate(page, writeInIndex);
          // if it's a double vote, just treat it as invalid
          if (await page.getByRole('alertdialog').isVisible()) {
            await page.getByText('Cancel').click();
            await markUndervote(page);
          }
          break;
        case 6:
          await page.getByText('Add new write-in candidate').click();
          await page.keyboard.type(
            WRITE_IN_NAMES[Math.floor(writeInIndex / 8)]
          );
          await page.getByText('Add', { exact: true }).click();
          break;
        default:
          await markUndervote(page);
      }

      await getPrimaryButton(page).waitFor();
      if (await page.getByText('Finish').isVisible()) {
        await page.getByText('Finish').click();
        await page.getByText('Write-In Adjudication').waitFor();
        hasFinishedWriteInsForContest = true;
      } else {
        await page.getByText('Next').click();
        writeInIndex += 1;
      }
    }
  }

  await page.getByText('Write-In Adjudication').waitFor();
  await screenshot('write-in-screen-post-adjudication');

  await page.getByText('Reports').click();
  await page.getByText('Unofficial Tally Reports').waitFor();
  await screenshot('reports-screen-unofficial');

  await page
    .getByRole('button', { name: 'Full Election Tally Report' })
    .click();
  await page
    .getByRole('heading', { name: 'Full Election Tally Report' })
    .waitFor();
  await waitForReportToLoad(page);
  await screenshot('full-election-report-unofficial');
  await printAndSaveReport({
    page,
    printerHandler,
    dir: 'results',
    filename: 'full-election-report.pdf',
  });

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
  await waitForReportToLoad(page);
  await screenshot('tally-report-builder-done');

  await page.getByRole('button', { name: 'Reports' }).click();
  await page.getByText('Voting Method Ballot Count Report').click();
  await page
    .getByRole('heading', { name: 'Voting Method Ballot Count Report' })
    .waitFor();
  await waitForReportToLoad(page);
  await screenshot('ballot-count-report-voting-method');
  await printAndSaveReport({
    page,
    printerHandler,
    dir: 'results',
    filename: 'ballot-count-report-voting-method.pdf',
  });

  await page.getByRole('button', { name: 'Reports' }).click();
  await page.getByText('Unofficial Write-In Adjudication Report').click();
  await page
    .getByRole('heading', { name: 'Write-In Adjudication Report' })
    .waitFor();
  await waitForReportToLoad(page);
  await screenshot('write-in-adjudication-report');
  await printAndSaveReport({
    page,
    printerHandler,
    dir: 'results',
    filename: 'write-in-adjudication-report.pdf',
  });

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

test('wia', async ({ page }) => {
  const usbHandler = getMockFileUsbDriveHandler();
  const printerHandler = getMockFilePrinterHandler();
  printerHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  const { electionDefinition, manualCastVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;

  const { screenshot } = makeScreenshotHelpers(page, 'wia');

  await page.goto('/');
  await configureMachine({
    page,
    usbHandler,
    electionDefinition,
  });

  await logInAsElectionManager(page, election);
  await page.getByRole('heading', { name: 'Election', exact: true }).waitFor();
  await page.getByText('Tally').click();
  await page.getByText('Cast Vote Records (CVRs)').waitFor();

  await insertUsbDriveWithCvrs({
    cvrPath: manualCastVoteRecordExport.asDirectoryPath(),
    convertToOfficial: true,
    usbHandler,
    electionDefinition,
  });
  await page.getByText('Load CVRs').click();
  await page.getByRole('button', { name: 'Load' }).click();
  await page.getByText('1 New CVR Loaded').waitFor();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByText('Total CVR Count: 1').waitFor();

  await page.getByText('Write-Ins').click();
  await page.getByText('Write-In Adjudication').waitFor();

  await page.getByText('Adjudicate 1').first().click();
  await page.getByText('Zoom Out').waitFor();
  await screenshot('write-in-adjudication-view');
  await page.getByText('Zoom Out').click();
  await expect(page.getByText('Zoom In')).toBeEnabled();
  await screenshot('write-in-adjudication-view-zoomed-out');

  await page.getByText('Finish').click();
  await page.getByText('Adjudicate 2').click();
  await page.getByText('Zoom Out').click();
  await page.getByText('Obadiah Carrigan').click();
  await page.getByText('Possible Double Vote Detected').waitFor();
  await screenshot('write-in-adjudication-double-vote');
});

test('manual results', async ({ page }) => {
  const usbHandler = getMockFileUsbDriveHandler();
  const printerHandler = getMockFilePrinterHandler();
  printerHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;

  const { screenshot } = makeScreenshotHelpers(page, 'manual');

  await page.goto('/');
  await configureMachine({
    page,
    usbHandler,
    electionDefinition,
  });

  await logInAsElectionManager(page, election);
  await page.getByRole('heading', { name: 'Election', exact: true }).waitFor();
  await page.getByText('Tally').click();
  await page.getByText('Cast Vote Records (CVRs)').waitFor();

  await insertUsbDriveWithCvrs({
    cvrPath: castVoteRecordExport.asDirectoryPath(),
    convertToOfficial: true,
    usbHandler,
    electionDefinition,
  });
  await page.getByText('Load CVRs').click();
  await page.getByRole('button', { name: 'Load' }).click();
  await page.getByText('184 New CVRs Loaded').waitFor();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByText('Total CVR Count: 184').waitFor();

  await page.getByText('Manual Tallies').click();
  await screenshot('manual-tallies-tab-empty');
  await openDropdown(page, 'Ballot Style');
  await selectOpenDropdownOption(page, 'card-number-3');
  await openDropdown(page, 'Precinct');
  await selectOpenDropdownOption(page, 'Test Ballot');
  await openDropdown(page, 'Voting Method');
  await screenshot('manual-tallies-metadata-selection');
  await selectOpenDropdownOption(page, 'Absentee');
  await page.getByText('Enter Tallies').click();

  await page.locator('input').fill('10');
  await screenshot('manual-tallies-total-ballots-cast');
  await page.getByText('Save & Next').click();

  for (const [
    contestIndex,
    contest,
  ] of electionDefinition.election.contests.entries()) {
    await page.getByText(contest.title).waitFor();
    const inputs = await page.locator('input').all();
    for (const [inputIndex, input] of inputs.entries()) {
      if (inputIndex === 0) {
        continue; // pre-filled ballots cast input
      }

      const numPossibleVotes =
        contest.type === 'candidate' ? contest.seats * 10 : 10;
      // first three inputs are ballot count, undervote, and undervote,
      // skip those and allocate all votes to the first contest option
      const FIRST_CONTEST_OPTION_INPUT_INDEX = 3;
      await input.fill(
        inputIndex === FIRST_CONTEST_OPTION_INPUT_INDEX
          ? numPossibleVotes.toString()
          : '0'
      );
    }

    if (contestIndex === 0) {
      await screenshot('manual-tallies-contest');
    }
    await getPrimaryButton(page).click();
  }

  await page.getByText('Total Manual Ballot Count: 10').waitFor();
  await screenshot('manual-tallies-tab-filled');

  await page.getByText('Reports').click();
  await page
    .getByRole('button', { name: 'Full Election Tally Report' })
    .click();
  await waitForReportToLoad(page);

  await printAndSaveReport({
    page,
    printerHandler,
    dir: 'manual',
    filename: 'manual-results-tally-report.pdf',
  });
});
