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
import { find } from '@votingworks/basics';
import { zipFile } from '@votingworks/test-utils';
import {
  buildIntegrationTestHelper,
  capturePrintedPdf,
  captureReadinessReport,
  createFullyVotedBallot,
  createScreenshotNamer,
  generateCastVoteRecordExport,
  type ScreenshotNamer,
  withWriteIns,
} from '@votingworks/integration-test-utils';
import {
  AdjudicationReason,
  CandidateContest,
  CVR,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionDefinition,
  ElectionPackageFileName,
  LATEST_METADATA,
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
import { mkdir } from 'node:fs/promises';
import {
  forceLogOutAndResetElectionDefinition,
  logInAsElectionManager,
  logInAsSystemAdministrator,
  logOut,
} from './support/auth';
import {
  adjudicateAllWriteIns,
  getPendingContestItems,
} from './support/write_in_adjudication';
import {
  getPrimaryButton,
  openDropdown,
  selectOpenDropdownOption,
  waitForReportToLoad,
} from './support/navigation';

async function printAndCaptureReport({
  page,
  printerHandler,
  namer,
  name,
}: {
  page: Page;
  printerHandler: MockFilePrinterHandler;
  namer: ScreenshotNamer;
  name: string;
}) {
  await page.getByText('Print Report').click();
  await page.getByText('Printing').waitFor();
  await page.clock.fastForward(3000);
  await expect(page.getByText('Printing')).toHaveCount(0);

  await capturePrintedPdf(printerHandler.getLastPrintPath(), name, namer);
}

test.beforeAll(setupTemporaryRootDir);
test.afterAll(clearTemporaryRootDir);

test.beforeEach(async ({ page }) => {
  await forceLogOutAndResetElectionDefinition(page);
  getMockFilePrinterHandler().cleanup();
  getMockFileUsbDriveHandler().cleanup();
  await page.clock.install();
});

test('system administrator', async ({ page }, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  const usbHandler = getMockFileUsbDriveHandler();
  const printerHandler = getMockFilePrinterHandler();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { election, electionData } = electionDefinition;
  const electionPackage = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionData,
    [ElectionPackageFileName.METADATA]: JSON.stringify(LATEST_METADATA),
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(
      DEFAULT_SYSTEM_SETTINGS
    ),
    [ElectionPackageFileName.APP_STRINGS]: JSON.stringify({}),
  });
  const electionPackageFileName = 'election-package.zip';

  const { screenshot, screenshotWithButtonHighlight } =
    buildIntegrationTestHelper(page, namer);

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

  await screenshotWithButtonHighlight('Lock Machine', 'lock-machine-button');

  await screenshotWithButtonHighlight(
    'Unconfigure Machine',
    'unconfigure-button'
  );

  await page.getByText('Unconfigure Machine').click();
  await page.getByRole('heading', { name: 'Unconfigure Machine' }).waitFor();
  await screenshotWithButtonHighlight(
    'Delete All Election Data',
    'confirm-unconfigure-button'
  );

  await page.getByText('Cancel').click();
  await screenshotWithButtonHighlight(
    'Save Election Package',
    'sa-save-election-package-button'
  );
  await page.getByText('Save Election Package').click();
  await page.getByRole('heading', { name: 'Save Election Package' }).waitFor();
  await screenshotWithButtonHighlight(
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
  await screenshotWithButtonHighlight('Save Logs', 'sa-save-logs-button');
  await page.getByText('Save Logs').click();
  await page.getByRole('heading', { name: 'Save Logs' }).waitFor();
  await screenshotWithButtonHighlight('Save', 'sa-confirm-save-logs-button');

  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('heading', { name: 'Logs Saved' }).waitFor();
  await screenshot('logs-saved');
  await page.getByText('Close').click();

  await page.getByText('Set Date and Time').click();
  await page.getByRole('heading', { name: 'Set Date and Time' }).waitFor();
  await screenshot('set-date-and-time');
  await page.getByText('Cancel').click();

  // format USB drive flow
  await screenshotWithButtonHighlight(
    'Format USB Drive',
    'format-usb-drive-button'
  );
  await page.getByText('Format USB Drive').click();
  await page.getByRole('heading', { name: 'Format USB Drive' }).waitFor();
  await screenshotWithButtonHighlight(
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

  await screenshotWithButtonHighlight(
    'Print Test Page',
    'print-test-page-button'
  );
  await page.getByRole('button', { name: 'Print Test Page' }).click();
  await page.clock.fastForward(3000);
  await page.getByText('Test Page Printed').waitFor();
  await screenshot('test-page-printed');
  await page.getByText('Cancel').click();

  await screenshotWithButtonHighlight(
    'Save Readiness Report',
    'save-readiness-report-button'
  );
  await page.getByRole('button', { name: 'Save Readiness Report' }).click();
  await page.getByRole('heading', { name: 'Save Readiness Report' }).waitFor();

  await screenshotWithButtonHighlight(
    'Save',
    'confirm-save-readiness-report-button'
  );
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('heading', { name: 'Readiness Report Saved' }).waitFor();
  await screenshot('readiness-report-saved');
  await page.getByRole('button', { name: 'Close' }).click();

  await captureReadinessReport('readiness-report', namer);
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
    [ElectionPackageFileName.METADATA]: JSON.stringify(LATEST_METADATA),
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(systemSettings),
    [ElectionPackageFileName.APP_STRINGS]: JSON.stringify({}),
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

test('results', async ({ page }, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  test.setTimeout(120_000);
  const usbHandler = getMockFileUsbDriveHandler();
  const printerHandler = getMockFilePrinterHandler();
  printerHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;

  const { screenshot } = buildIntegrationTestHelper(page, namer);

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
  await page.getByRole('button', { name: 'Adjudicate' }).waitFor();
  await screenshot('adjudication-screen-pre-adjudication');

  await adjudicateAllWriteIns(page);

  await page.getByRole('button', { name: 'Review' }).waitFor();
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
  await printAndCaptureReport({
    page,
    printerHandler,
    namer,
    name: 'full-election-report',
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
  await printAndCaptureReport({
    page,
    printerHandler,
    namer,
    name: 'ballot-count-report-voting-method',
  });

  await page.getByRole('button', { name: 'Reports' }).click();
  await page.getByText('Write-In Adjudication Report').click();
  await page
    .getByRole('heading', { name: 'Write-In Adjudication Report' })
    .waitFor();
  await waitForReportToLoad(page);
  await screenshot('write-in-adjudication-report');
  await printAndCaptureReport({
    page,
    printerHandler,
    namer,
    name: 'write-in-adjudication-report',
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

test('adjudication', async ({ page }, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  const usbHandler = getMockFileUsbDriveHandler();
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { election } = electionDefinition;

  // Both ballots are fully voted. Ballot 1 has a "Bill Withers" write-in in the
  // mayor contest; ballot 2 has a marginal mark on an unvoted option in the
  // controller contest — so the two adjudication types are on different ballots
  // and different contests. The two ballots use different ballot styles so the
  // adjudication queue (which sorts by ballot style group before the
  // admin-assigned CVR id) presents the write-in ballot first, deterministically.
  const mayorContest = find(
    election.contests,
    (contest): contest is CandidateContest => contest.id === 'mayor'
  );
  const writeInVotes = withWriteIns(
    createFullyVotedBallot(electionDefinition, '1-1'),
    mayorContest,
    ['Bill Withers']
  );
  const cvrExportPath = await generateCastVoteRecordExport(electionDefinition, [
    { ballotStyleId: '1-1', precinctId: '20', votes: writeInVotes },
    {
      ballotStyleId: '1-2',
      precinctId: '21',
      votes: createFullyVotedBallot(electionDefinition, '1-2'),
      marginalMarks: [{ contestId: 'controller', optionId: 'oprah-winfrey' }],
    },
  ]);

  // Marginal marks only surface for adjudication when enabled, and the marginal
  // mark scores ~0.07, so the definite threshold must be above it.
  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    adminAdjudicationReasons: [AdjudicationReason.MarginalMark],
    markThresholds: { marginal: 0.05, definite: 0.1 },
  };

  const { screenshot, screenshotWithButtonHighlight } =
    buildIntegrationTestHelper(page, namer);

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
    cvrPath: cvrExportPath,
    convertToOfficial: false,
    usbHandler,
    electionDefinition,
  });
  await page.getByText('Load CVRs').click();
  await page.getByRole('button', { name: 'Load' }).click();
  await page.getByText('2 New CVRs Loaded').waitFor();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByText('Total CVR Count: 2').waitFor();

  // Adjudication start screen
  await page.getByText('Adjudication').click();
  await page.getByRole('button', { name: 'Adjudicate' }).waitFor();
  await screenshot('adjudication-start');
  await screenshotWithButtonHighlight(
    'Adjudicate',
    'adjudication-start-adjudicate-highlighted'
  );

  // Full ballot view
  await page.getByRole('button', { name: 'Adjudicate' }).click();
  await page.getByText(/Ballot \d+ of \d+/).waitFor();
  await screenshot('adjudication-ballot-view');

  // Open the contest that needs adjudication
  await getPendingContestItems(page).first().click();
  await page.getByRole('button', { name: 'Confirm' }).waitFor();
  await screenshot('adjudication-contest-view');

  // Open the write-in dropdown
  const writeInCombobox = page.getByRole('combobox');
  await writeInCombobox.click();
  await screenshot('adjudication-write-in-dropdown-open');

  // Type the write-in name
  await writeInCombobox.fill('Bill Withers');
  const addCandidateOption = page.getByText(/Press enter to add: Bill Withers/);
  await addCandidateOption.waitFor();
  await screenshot('adjudication-write-in-add-candidate');

  // Add the write-in candidate
  await addCandidateOption.click();
  await screenshot('adjudication-contest-view-after-selection');

  // Confirm back to the ballot view
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.getByText(/Ballot \d+ of \d+/).waitFor();
  await screenshot('adjudication-ballot-view-after-changes');

  // Accept ballot 1 and advance to ballot 2, which has the marginal mark.
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.getByText('Ballot 2 of 2').waitFor();
  await screenshot('adjudication-marginal-ballot-view');

  // Open the contest with the marginal mark
  await getPendingContestItems(page).first().click();
  await page.getByRole('button', { name: 'Confirm' }).waitFor();
  await screenshot('adjudication-marginal-contest-view');

  // Dismiss the marginal mark
  await page.getByRole('button', { name: 'Dismiss' }).click();
  await screenshot('adjudication-marginal-dismissed');

  // Confirm back to the ballot view
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.getByText('Ballot 2 of 2').waitFor();
  await screenshot('adjudication-marginal-ballot-view-after-changes');

  // Finalize the last ballot, returning to the adjudication start screen with
  // the completed progress bar.
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.getByText('All ballots adjudicated').waitFor();
  await screenshot('adjudication-complete');
});

test('qualified write-in candidates', async ({ page }, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  const usbHandler = getMockFileUsbDriveHandler();
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { election } = electionDefinition;

  // Qualified write-in mode restricts write-in adjudication to a pre-defined
  // list of candidates, managed from the adjudication screen.
  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    areWriteInCandidatesQualified: true,
  };

  // One ballot with a mayor write-in for one of the qualified candidates, so we
  // can show how qualified write-ins appear during adjudication.
  const mayorContest = find(
    election.contests,
    (contest): contest is CandidateContest => contest.id === 'mayor'
  );
  const writeInVotes = withWriteIns(
    createFullyVotedBallot(electionDefinition, '1-1'),
    mayorContest,
    ['Otis Redding']
  );
  const cvrExportPath = await generateCastVoteRecordExport(electionDefinition, [
    { ballotStyleId: '1-1', precinctId: '20', votes: writeInVotes },
  ]);

  const { screenshot, screenshotWithButtonHighlight } =
    buildIntegrationTestHelper(page, namer);

  await page.goto('/');
  await configureMachine({
    page,
    usbHandler,
    electionDefinition,
    systemSettings,
  });

  await logInAsElectionManager(page, election);
  await page.getByRole('heading', { name: 'Election', exact: true }).waitFor();

  // Adjudication screen shows the Qualified Write-In Candidates card.
  await page.getByText('Adjudication').click();
  await page.getByRole('button', { name: 'Add Candidates' }).waitFor();
  await screenshot('qualified-write-in-adjudication');
  await screenshotWithButtonHighlight(
    'Add Candidates',
    'qualified-write-in-add-candidates-highlighted'
  );

  // Candidates screen, with the mayor contest selected by default.
  await page.getByRole('button', { name: 'Add Candidates' }).click();
  await page.getByRole('button', { name: 'Add Candidate' }).waitFor();
  await screenshot('qualified-write-in-candidates-empty');
  await screenshotWithButtonHighlight(
    'Add Candidate',
    'qualified-write-in-add-candidate-highlighted'
  );

  // Add three qualified candidates to the mayor contest.
  const candidateNames = ['Bill Withers', 'Aretha Franklin', 'Otis Redding'];
  for (const [i, name] of candidateNames.entries()) {
    await page.getByRole('button', { name: 'Add Candidate' }).click();
    await page.getByRole('textbox', { name: 'Candidate name: New' }).fill(name);
    await screenshot(`qualified-write-in-candidate-${i + 1}`);
  }

  // Save the qualified candidates.
  await screenshotWithButtonHighlight(
    'Save',
    'qualified-write-in-save-highlighted'
  );
  await page.getByRole('button', { name: 'Save' }).click();
  await screenshot('qualified-write-in-saved');

  // Load the CVR with the mayor write-in.
  await page.getByText('Tally').click();
  await page.getByText('Cast Vote Records (CVRs)').waitFor();
  await insertUsbDriveWithCvrs({
    cvrPath: cvrExportPath,
    convertToOfficial: false,
    usbHandler,
    electionDefinition,
  });
  await page.getByText('Load CVRs').click();
  await page.getByRole('button', { name: 'Load' }).click();
  await page.getByText('1 New CVR Loaded').waitFor();
  await page.getByRole('button', { name: 'Close' }).click();

  // Adjudicate the write-in: the dropdown now offers the qualified candidates
  // we added, rather than free-text entry.
  await page.getByText('Adjudication').click();
  await page.getByRole('button', { name: 'Adjudicate' }).click();
  await page.getByText(/Ballot \d+ of \d+/).waitFor();
  await getPendingContestItems(page).first().click();
  await page.getByRole('button', { name: 'Confirm' }).waitFor();
  await screenshot('qualified-write-in-adjudication-contest');
  await page.getByRole('combobox').click();
  await screenshot('qualified-write-in-adjudication-dropdown');
});

test('manual results', async ({ page }, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  const usbHandler = getMockFileUsbDriveHandler();
  const printerHandler = getMockFilePrinterHandler();
  printerHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;

  const { screenshot } = buildIntegrationTestHelper(page, namer);

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

  await printAndCaptureReport({
    page,
    printerHandler,
    namer,
    name: 'manual-results-tally-report',
  });
});
