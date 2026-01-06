import { expect, Page, test } from '@playwright/test';
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
  clearTemporaryRootDir,
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { assertDefined, find, iter } from '@votingworks/basics';
import { buildIntegrationTestHelper, zipFile } from '@votingworks/test-utils';
import {
  AdjudicationReason,
  CVR,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
  ElectionPackageFileName,
  SystemSettings,
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
import { FileSystemEntryType, listDirectoryRecursive } from '@votingworks/fs';
import {
  forceLogOutAndResetElectionDefinition,
  logInAsElectionManager,
  logInAsSystemAdministrator,
  logOut,
} from './support/auth';
import {
  getAdjudicateButtons,
  selectCandidateOrInvalidate,
  WRITE_IN_NAMES,
} from './support/write_in_adjudication';
import {
  getPrimaryButton,
  openDropdown,
  selectOpenDropdownOption,
  waitForReportToLoad,
} from './support/navigation';

async function saveLastExportedReport({
  usbHandler,
  filename,
}: {
  usbHandler: MockFileUsbDriveHandler;
  filename: string;
}) {
  const usbDataPath = usbHandler.getDataPath();
  if (!usbDataPath) return;

  const files = iter(listDirectoryRecursive(usbDataPath));
  const mostRecentFile = await files
    .filterMap((file) => (file.isOk() ? file.ok() : null))
    .filter((file) => file.type !== FileSystemEntryType.Directory)
    .maxBy((file) => file.mtime.getTime());
  if (!mostRecentFile) return;

  await copyFile(mostRecentFile.path, `./test-results/screenshots/${filename}`);
}

async function printAndSaveReport({
  page,
  printerHandler,
  filename,
}: {
  page: Page;
  printerHandler: MockFilePrinterHandler;
  filename: string;
}) {
  await page.getByText('Print Report').click();
  await page.getByText('Printing').waitFor();
  await page.clock.fastForward(3000);
  await expect(page.getByText('Printing')).toHaveCount(0);

  const lastPrintPath = printerHandler.getLastPrintPath();
  await copyFile(
    assertDefined(lastPrintPath),
    `./test-results/screenshots/${filename}`
  );
}

test.beforeAll(setupTemporaryRootDir);
test.afterAll(clearTemporaryRootDir);

test.beforeEach(async ({ page }) => {
  await forceLogOutAndResetElectionDefinition(page);
  getMockFilePrinterHandler().cleanup();
  getMockFileUsbDriveHandler().cleanup();
  await page.clock.install();
});

test('system administrator', async ({ page }) => {
  const usbHandler = getMockFileUsbDriveHandler();
  const printerHandler = getMockFilePrinterHandler();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { election, electionData } = electionDefinition;
  const electionPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionData,
  });
  const electionPackageFileName = 'election-package.zip';

  const { screenshot, screenshotWithFocusHighlight } =
    buildIntegrationTestHelper(page);

  /**
   * configuration
   */
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

  await screenshotWithFocusHighlight('Lock Machine', 'lock-machine-button');

  await screenshotWithFocusHighlight(
    'Unconfigure Machine',
    'unconfigure-button'
  );

  await page.getByText('Unconfigure Machine').click();
  await page.getByRole('heading', { name: 'Unconfigure Machine' }).waitFor();
  await screenshotWithFocusHighlight(
    'Delete All Election Data',
    'confirm-unconfigure-button'
  );

  await page.getByText('Cancel').click();
  await screenshotWithFocusHighlight(
    'Save Election Package',
    'sa-save-election-package-button'
  );
  await page.getByText('Save Election Package').click();
  await page.getByRole('heading', { name: 'Save Election Package' }).waitFor();
  await screenshotWithFocusHighlight(
    'Save',
    'sa-confirm-save-election-package-button'
  );

  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('heading', { name: 'Election Package Saved' }).waitFor();
  await screenshot('sa-election-package-saved');
  await page.getByText('Close').click();

  /**
   * smart cards
   */
  await page.getByText('Smart Cards').click();
  await page.getByRole('heading', { name: 'Smart Cards' }).waitFor();
  await screenshot('smart-cards-no-card');

  async function removeCard() {
    mockCardRemoval();
    await page.getByText('Insert a smart card', { exact: true }).waitFor();
  }

  mockBlankCard();
  await page.getByText('Blank Card').waitFor();
  await screenshot('smart-cards-blank-card');

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
    election: electionFamousNames2021Fixtures.readElection(),
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
    election: electionFamousNames2021Fixtures.readElection(),
  });
  await page.getByText('Poll Worker Card', { exact: true }).waitFor();
  await screenshot('smart-cards-pw-wrong-election');
  await removeCard();

  /**
   * settings
   */
  await page.getByText('Settings').click();
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await screenshot('settings-screen');

  await mkdir('/var/log/votingworks', { recursive: true }); // app must find a logs dir for saving logs to be successful
  await screenshotWithFocusHighlight('Save Logs', 'sa-save-logs-button');
  await page.getByText('Save Logs').click();
  await page.getByRole('heading', { name: 'Save Logs' }).waitFor();
  await screenshotWithFocusHighlight('Save', 'sa-confirm-save-logs-button');

  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('heading', { name: 'Logs Saved' }).waitFor();
  await screenshot('logs-saved');
  await page.getByText('Close').click();

  await page.getByText('Set Date and Time').click();
  await page.getByRole('heading', { name: 'Set Date and Time' }).waitFor();
  await screenshot('set-date-and-time');
  await page.getByText('Cancel').click();

  // format USB drive flow
  await screenshotWithFocusHighlight(
    'Format USB Drive',
    'format-usb-drive-button'
  );
  await page.getByText('Format USB Drive').click();
  await page.getByRole('heading', { name: 'Format USB Drive' }).waitFor();
  await screenshotWithFocusHighlight(
    'Format USB Drive',
    'confirm-format-usb-drive-button'
  );
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

  /**
   * diagnostics
   */
  printerHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  await page.getByText('Diagnostics').click();
  await page.getByRole('heading', { name: 'Diagnostics' }).waitFor();
  await screenshot('diagnostics-screen');

  await screenshotWithFocusHighlight(
    'Print Test Page',
    'print-test-page-button'
  );
  await page.getByRole('button', { name: 'Print Test Page' }).click();
  await page.clock.fastForward(3000);
  await page.getByText('Test Page Printed').waitFor();
  await screenshot('test-page-printed');
  await page.getByText('Cancel').click();

  await screenshotWithFocusHighlight(
    'Save Readiness Report',
    'save-readiness-report-button'
  );
  await page.getByRole('button', { name: 'Save Readiness Report' }).click();
  await page.getByRole('heading', { name: 'Save Readiness Report' }).waitFor();

  await screenshotWithFocusHighlight(
    'Save',
    'confirm-save-readiness-report-button'
  );
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('heading', { name: 'Readiness Report Saved' }).waitFor();
  await screenshot('readiness-report-saved');
  await page.getByRole('button', { name: 'Close' }).click();

  await saveLastExportedReport({
    usbHandler,
    filename: 'readiness-report.pdf',
  });
});

async function configureMachine({
  page,
  usbHandler,
  electionDefinition,
  systemSettings = DEFAULT_SYSTEM_SETTINGS,
}: {
  page: Page;
  usbHandler: MockFileUsbDriveHandler;
  electionDefinition: ElectionDefinition;
  systemSettings?: SystemSettings;
}): Promise<void> {
  const { election, electionData } = electionDefinition;
  const electionPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionData,
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(systemSettings),
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
  test.setTimeout(120_000);
  const usbHandler = getMockFileUsbDriveHandler();
  const printerHandler = getMockFilePrinterHandler();
  printerHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;

  const { screenshot } = buildIntegrationTestHelper(page);

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

  await page.getByText('Adjudication').click();
  await page.getByText('Adjudication Queue').waitFor();
  await screenshot('adjudication-screen-pre-adjudication');

  // iterate through all the adjudication queues
  const numWriteInContests = await getAdjudicateButtons(page).count();
  for (
    let contestIndex = 0;
    contestIndex < numWriteInContests;
    contestIndex += 1
  ) {
    await (await getAdjudicateButtons(page).all())[contestIndex].click();

    let hasFinishedWriteInsForContest = false;
    let writeInIndex = 0;
    while (!hasFinishedWriteInsForContest) {
      // There is occasional flakiness because the write-in adjudication screen
      // is still rendering and the button press doesn't always register.
      // Zooming out, by acting as a delay, seems to avoid the problem.
      await page.getByText('Zoom Out').click();
      await page.getByRole('combobox').click();

      // uneven but deterministic strategy for making adjudications
      switch (writeInIndex % 8) {
        case 0:
        case 1:
        case 2:
        case 3:
        case 4:
          // Creates a candidate the first time, re-selects subsequent times
          await page.getByRole('combobox').fill('Write-In Campaign Candidate');
          await page.keyboard.press('Enter');
          break;
        case 5:
          // Select a dropdown option via clicking
          await selectCandidateOrInvalidate(page, writeInIndex);
          break;
        case 6:
          // Mark as invalid by clicking checkbox
          await page
            .getByRole('checkbox', { name: /write-in/i, checked: true })
            .click();
          break;
        default:
          // Create other new candidate
          await page
            .getByRole('combobox')
            .fill(WRITE_IN_NAMES[Math.floor(writeInIndex / 8)]);
          await page.keyboard.press('Enter');
      }

      await expect(getPrimaryButton(page)).toBeEnabled();
      if (await page.getByText('Finish').isVisible()) {
        await page.getByText('Finish').click();
        await page.getByText('Adjudication Queue').waitFor();
        hasFinishedWriteInsForContest = true;
      } else {
        await page.getByText('Save & Next').click();
        writeInIndex += 1;
      }
    }
  }

  await page.getByText('Adjudication Queue').waitFor();
  await screenshot('adjudication-screen-post-adjudication');

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

test('adjudication', async ({ page }) => {
  const usbHandler = getMockFileUsbDriveHandler();
  const printerHandler = getMockFilePrinterHandler();
  printerHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { manualCastVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;
  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    adminAdjudicationReasons: [AdjudicationReason.MarginalMark],
    markThresholds: {
      marginal: 0.05,
      definite: 0.1,
    },
  };
  // modify the cvr for the first contest to include mark scores so we have a single marginal mark
  const contestId = 'Governor-061a401b';
  const exportDirectoryPath = await modifyCastVoteRecordExport(
    manualCastVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: (cvr) => {
        const snapshot = find(
          cvr.CVRSnapshot,
          (s) => s.Type === CVR.CVRType.Original
        );
        const contest = snapshot.CVRContest.find(
          (c) => c.ContestId === contestId
        );
        if (contest) {
          const option0 = assertDefined(
            contest.CVRContestSelection[0]?.SelectionPosition[0]
          );
          option0.MarkMetricValue = ['0.08'];
        }
        return cvr;
      },
    }
  );

  const { screenshot } = buildIntegrationTestHelper(page);

  await page.goto('/');
  await configureMachine({
    page,
    usbHandler,
    electionDefinition,
    systemSettings,
  });

  await logInAsElectionManager(page, election);
  await page.getByRole('heading', { name: 'Election', exact: true }).waitFor();
  await page.getByText('Tally').click();
  await page.getByText('Cast Vote Records (CVRs)').waitFor();

  await insertUsbDriveWithCvrs({
    cvrPath: exportDirectoryPath,
    convertToOfficial: true,
    usbHandler,
    electionDefinition,
  });
  await page.getByText('Load CVRs').click();
  await page.getByRole('button', { name: 'Load' }).click();
  await page.getByText('1 New CVR Loaded').waitFor();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByText('Total CVR Count: 1').waitFor();

  await page.getByText('Adjudication').click();
  await page.getByText('Adjudication Queue').waitFor();

  await page.getByText('Adjudicate 1').first().click();
  await page.getByText('Zoom Out').waitFor();
  await screenshot('adjudication-view');
  await page.getByText('Zoom Out').click();
  await expect(page.getByText('Zoom In')).toBeEnabled();
  await screenshot('adjudication-view-zoomed-out');
  await page.getByRole('combobox').click();
  await screenshot('adjudication-write-in-focused');
  await page.getByRole('combobox').fill('New Candidate');
  await page.keyboard.press('Enter');
  await screenshot('adjudication-write-in-new-candidate-adjudicated');
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await screenshot('adjudication-marginal-mark-adjudicated');
  await page.getByText('Finish').click();
  await page.getByText('Adjudication Queue').waitFor();
});

test('manual results', async ({ page }) => {
  const usbHandler = getMockFileUsbDriveHandler();
  const printerHandler = getMockFilePrinterHandler();
  printerHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;

  const { screenshot } = buildIntegrationTestHelper(page);

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
    filename: 'manual-results-tally-report.pdf',
  });
});
