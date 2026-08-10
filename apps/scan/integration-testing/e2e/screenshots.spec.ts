import { expect, test } from '@playwright/test';
import { mockCardRemoval } from '@votingworks/auth';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import {
  asElectionDefinition,
  clearTemporaryRootDir,
  electionFamousNames2021Fixtures,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { getMockFileFujitsuPrinterHandler } from '@votingworks/fujitsu-thermal-printer';
import {
  MULTI_LANGUAGE_UI_STRINGS,
  buildIntegrationTestHelper,
  createFullyVotedBallot,
  createScreenshotNamer,
  renderMarkedBallots,
  withOvervote,
  withUndervote,
  withWriteIns,
} from '@votingworks/integration-test-utils';
import type {
  CandidateContest,
  PollingPlace,
  SystemSettings,
  VotesDict,
} from '@votingworks/types';
import {
  AdjudicationReason,
  DEFAULT_SYSTEM_SETTINGS,
} from '@votingworks/types';
import { getMockUsbDriveHandler } from '@votingworks/usb-drive';
import {
  forceLogOutAndResetElectionDefinition,
  logInAsElectionManager,
  logInAsPollWorker,
  logInAsSystemAdministrator,
} from './support/auth.js';
import { capturePrintedReport } from './support/print_to_png.js';
import { mockPdiScannerHandler } from './support/scanner.js';

test.beforeAll(setupTemporaryRootDir);
test.afterAll(clearTemporaryRootDir);

test.beforeEach(async ({ page }) => {
  await forceLogOutAndResetElectionDefinition(page);
  getMockUsbDriveHandler().cleanup();
});

test('configuration', async ({ page }, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  const fixtureSet = electionFamousNames2021Fixtures;
  const usbHandler = getMockUsbDriveHandler();
  const {
    screenshot,
    screenshotWithButtonHighlight,
    withContainerVerticallyExpanded,
  } = buildIntegrationTestHelper(page, namer);

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
  await capturePrintedReport('em-printer-test-page', namer);
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

test('early voting', async ({ page }, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  const fixtureSet = electionFamousNames2021Fixtures;
  const usbHandler = getMockUsbDriveHandler();
  const { screenshot, screenshotWithButtonHighlight } =
    buildIntegrationTestHelper(page, namer);

  // The famous-names election only defines election-day polling places, so the
  // early-voting polling place picker would otherwise have no options. Add a
  // synthetic early-voting location (covering the same precinct as North
  // Lincoln) so the early-voting flow can be configured.
  const baseElection = fixtureSet.readElection();
  const earlyVotingPollingPlace: PollingPlace = {
    id: 'north-lincoln-early-voting',
    name: 'North Lincoln Early Voting Center',
    precincts: { '23': { type: 'whole' } },
    type: 'early_voting',
  };
  const election: typeof baseElection = {
    ...baseElection,
    pollingPlaces: [
      ...(baseElection.pollingPlaces ?? []),
      earlyVotingPollingPlace,
    ],
  };
  const electionDefinition = asElectionDefinition(election);

  // Configure the machine. The "Ballot Casting Mode" toggle (gated behind the
  // enableEarlyVoting system setting) defaults to Election Day.
  await logInAsElectionManager(page, election);
  usbHandler.insert(
    await mockElectionPackageFileTree({
      electionDefinition,
      systemSettings: {
        ...DEFAULT_SYSTEM_SETTINGS,
        enableEarlyVoting: true,
      },
    })
  );
  await page.getByText('Election Manager Menu').waitFor();

  // Switch to early voting (the default is Election Day). This is gated behind
  // the enableEarlyVoting system setting. Capture the toggle highlighted first.
  await screenshotWithButtonHighlight('Early Voting', 'em-early-voting-button');
  await page.getByText('Early Voting').click();
  await page
    .getByRole('option', { name: 'Early Voting', selected: true })
    .waitFor();

  // Selecting a casting mode resets the polling place, so choose it afterward.
  await page.getByLabel(/select a polling place/i).click({ force: true });
  await page
    .getByText('North Lincoln Early Voting Center', { exact: true })
    .click();
  await page
    .locator('.search-select')
    .getByText('North Lincoln Early Voting Center')
    .waitFor();

  // Switch to official ballot mode so the early voting banner shows cleanly
  // (test mode adds its own banner that would otherwise sit alongside it).
  await page.getByText('Official Ballot Mode').click();
  await page.getByText('Test Ballot Mode').waitFor();

  // Unauthenticated polls-closed screen shows the early voting banner.
  mockCardRemoval();
  await page.getByText('Insert a poll worker card to open polls.').waitFor();
  await screenshot('unauthenticated-early-voting');

  // Open polls.
  logInAsPollWorker(election);
  await page.getByRole('button', { name: 'Open Polls' }).click();
  await page
    .getByRole('heading', { name: 'Polls Opened' })
    .waitFor({ timeout: 60000 });
  mockCardRemoval();

  // Voter "Insert Your Ballot" screen also shows the early voting banner.
  await page.getByText('Insert Your Ballot').waitFor();
  await screenshot('insert-ballot-early-voting');

  // Inserting a poll worker card while polls are open in early voting mode
  // shows a guided prompt toward pausing voting (rather than closing polls, as
  // on election day).
  logInAsPollWorker(election);
  await page.getByText('Do you want to pause voting?').waitFor();
  await screenshot('pw-pause-voting-prompt');
  await screenshotWithButtonHighlight(
    'Pause Voting',
    'pw-pause-voting-prompt-button'
  );

  // Remove the poll worker card so the machine ends on a stable unauthenticated
  // screen. Leaving a card inserted mid-prompt prevents the next test's
  // beforeEach reset from reaching the PIN entry screen.
  mockCardRemoval();
  await page.getByText('Insert Your Ballot').waitFor();
});

test('voting', async ({ page }, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  const fixtureSet = electionFamousNames2021Fixtures;
  const electionDefinition = fixtureSet.readElectionDefinition();
  const { election } = electionDefinition;
  const usbHandler = getMockUsbDriveHandler();
  const {
    screenshot,
    screenshotWithButtonHighlight,
    screenshotWithLocatorHighlight,
  } = buildIntegrationTestHelper(page, namer);

  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    // All adjudication reasons enabled so each warning state is reachable.
    precinctScanAdjudicationReasons: [
      AdjudicationReason.BlankBallot,
      AdjudicationReason.Undervote,
      AdjudicationReason.Overvote,
    ],
    // Hide help button and disable screen reader (also hides Audio settings tab).
    disableVoterHelpButtons: true,
    precinctScanDisableScreenReaderAudio: true,
  };

  // Pre-render all ballot PDFs in one Chromium instance before the test flow.
  const ballotSpec = {
    electionDefinition,
    ballotStyleId: '1-1',
    precinctId: '20',
  } as const;

  // Start from a fully-voted ballot and derive each warning scenario from it.
  const fullVotes = createFullyVotedBallot(electionDefinition, '1-1');

  const singleSeatContests = election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate' && c.seats === 1
  );
  const multiSeatContests = election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate' && c.seats > 1
  );
  /* istanbul ignore next */
  if (singleSeatContests.length === 0 || multiSeatContests.length === 0) throw new Error('Expected single- and multi-seat contests');

  const [singleSeatContest] = singleSeatContests;
  const [multiSeatContest] = multiSeatContests;

  const undervoteVotes = withUndervote(
    withUndervote(fullVotes, singleSeatContest),
    multiSeatContest
  );
  const overvoteVotes = withOvervote(fullVotes, singleSeatContest);

  // Mixed: overvote several single-seat contests, blank others, undervote
  // the multi-seat contests — enough problems to trigger the summary view.
  const mixedVotes = [
    // Overvote the first half of single-seat contests.
    ...singleSeatContests
      .slice(0, Math.ceil(singleSeatContests.length / 2))
      .map((c) => (v: VotesDict) => withOvervote(v, c)),
    // Blank the second half of single-seat contests.
    ...singleSeatContests
      .slice(Math.ceil(singleSeatContests.length / 2))
      .map((c) => (v: VotesDict) => withUndervote(v, c)),
    // Undervote every multi-seat contest.
    ...multiSeatContests.map((c) => (v: VotesDict) => withUndervote(v, c)),
  ].reduce((v, fn) => fn(v), fullVotes);

  const [fullPdf, blankPdf, undervotePdf, overvotePdf, mixedPdf] =
    await renderMarkedBallots([
      { ...ballotSpec, votes: fullVotes },
      { ...ballotSpec, votes: {} },
      { ...ballotSpec, votes: undervoteVotes },
      { ...ballotSpec, votes: overvoteVotes },
      { ...ballotSpec, votes: mixedVotes },
    ]);

  await page.goto('/');
  await logInAsElectionManager(page, election);
  usbHandler.insert(
    await mockElectionPackageFileTree({
      electionDefinition,
      systemSettings,
      // Registers the supported languages and their native display names so the
      // voter language selector renders (see MULTI_LANGUAGE_UI_STRINGS).
      uiStrings: MULTI_LANGUAGE_UI_STRINGS,
    })
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

  logInAsPollWorker(election);
  await page.getByText('Do you want to open the polls?').waitFor();
  await screenshot('open-polls-prompt');
  await screenshotWithButtonHighlight('Open Polls', 'open-polls-button');

  await page.getByRole('button', { name: 'Open Polls' }).click();
  await page
    .getByRole('heading', { name: 'Polls Opened' })
    .waitFor({ timeout: 60000 });
  await screenshot('polls-opened');
  await capturePrintedReport('polls-opened-report', namer);
  await screenshotWithButtonHighlight(
    'Reprint Polls Opened Report',
    'reprint-polls-opened-report-button'
  );

  mockCardRemoval();
  await page.getByText('Insert Your Ballot').waitFor();

  logInAsPollWorker(election);
  await page.getByText('Do you want to close the polls?').waitFor();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page
    .getByRole('button', { name: 'Print Polls Opened Report' })
    .waitFor();
  await screenshotWithButtonHighlight(
    'Print Polls Opened Report',
    'pw-print-polls-opened-report-button'
  );
  mockCardRemoval();
  await page.getByText('Insert Your Ballot').waitFor();

  await screenshot('insert-ballot');
  await screenshotWithLocatorHighlight(
    page.getByTestId('electionInfo'),
    'insert-ballot-election-info'
  );
  await screenshotWithButtonHighlight('English', 'language-button');
  await page.getByRole('button', { name: 'English' }).click();
  await page
    .getByRole('heading', { name: 'Select Your Ballot Language' })
    .waitFor();
  await screenshot('language-settings');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByText('Insert Your Ballot').waitFor();

  // Successful scan: full votes, capture scanning screen then counted screen.
  // Throughout this test, after a ballot is scanned we move straight to the
  // next action without waiting for the "Insert Your Ballot" screen to return —
  // the backend re-enables scanning as soon as a ballot is accepted, so we don't
  // need to wait out the (3s) accepted-screen display hold.
  mockPdiScannerHandler.insertSheet(fullPdf);
  await page.getByText('Please wait').waitFor({ timeout: 15000 });
  await screenshot('scanning');
  await page.getByText('Your ballot was counted!').waitFor({ timeout: 15000 });
  await screenshot('ballot-counted');

  // Each "Review Your Ballot" warning below shares the same heading, and the
  // screen also renders briefly (with its buttons disabled) while the previous
  // ballot's acceptance is processed. Since we insert the next sheet without
  // waiting for the "Insert Your Ballot" screen to return, waiting only on the
  // heading can capture that stale, disabled screen. Wait for the "Cast Ballot"
  // button to be enabled so every screenshot consistently shows it enabled.
  async function waitForReviewScreen() {
    await page
      .getByRole('heading', { name: 'Review Your Ballot' })
      .waitFor({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Cast Ballot' })).toBeEnabled(
      { timeout: 15000 }
    );
  }

  // Blank ballot warning.
  mockPdiScannerHandler.insertSheet(blankPdf);
  await waitForReviewScreen();
  await screenshot('blank-ballot-warning');
  await page.getByRole('button', { name: 'Cast Ballot' }).click();

  // Undervote warning.
  mockPdiScannerHandler.insertSheet(undervotePdf);
  await waitForReviewScreen();
  await screenshot('undervote-warning');
  await page.getByRole('button', { name: 'Cast Ballot' }).click();

  // Overvote warning.
  mockPdiScannerHandler.insertSheet(overvotePdf);
  await waitForReviewScreen();
  await screenshot('overvote-warning');
  await page.getByRole('button', { name: 'Cast Ballot' }).click();

  // Mixed overvote + undervote warning.
  mockPdiScannerHandler.insertSheet(mixedPdf);
  await waitForReviewScreen();
  await screenshot('mixed-overvote-undervote-warning');
  await page.getByRole('button', { name: 'Cast Ballot' }).click();
  await page.getByText('Insert Your Ballot').waitFor({ timeout: 15000 });

  // Voter settings screenshots.
  await screenshotWithButtonHighlight('Settings', 'settings-button');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Color' }).waitFor();
  await screenshot('settings-color');
  await page.getByRole('tab', { name: 'Text Size' }).click();
  await page.getByRole('tab', { name: 'Text Size', selected: true }).waitFor();
  await screenshot('settings-text-size');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByText('Insert Your Ballot').waitFor();

  // Closing polls flow (single batch).
  logInAsPollWorker(election);
  await page.getByText('Do you want to close the polls?').waitFor();
  await screenshot('close-polls-prompt');
  await screenshotWithButtonHighlight('Close Polls', 'close-polls-button');
  await page.getByRole('button', { name: 'Close Polls' }).click();
  await page.getByRole('heading', { name: 'Polls Closed' }).waitFor({
    timeout: 60000,
  });
  await screenshot('polls-closed-report');
  await capturePrintedReport('polls-closed-report', namer);
  await screenshotWithButtonHighlight(
    'Reprint Polls Closed Report',
    'reprint-polls-closed-report-button'
  );

  mockCardRemoval();
  await page.getByText('Voting is complete.').waitFor();
  await screenshot('polls-closed');

  // Poll worker menu after polls are closed.
  logInAsPollWorker(election);
  await page
    .getByText('Voting is complete and the polls cannot be reopened.')
    .waitFor();
  await screenshot('pw-menu-polls-closed');
  await screenshotWithButtonHighlight(
    'Print Polls Closed Report',
    'pw-print-polls-closed-report-button'
  );
  await screenshotWithButtonHighlight('Power Down', 'pw-power-down');

  mockCardRemoval();
  await page.getByText('Voting is complete.').waitFor();

  // SA menu after polls are closed — screenshot then actually reset to paused.
  await logInAsSystemAdministrator(page);
  await page.getByRole('button', { name: 'Reset Polls to Paused' }).waitFor();
  await screenshotWithButtonHighlight(
    'Reset Polls to Paused',
    'sa-reset-polls-to-paused-button'
  );
  await page.getByRole('button', { name: 'Reset Polls to Paused' }).click();
  await page.getByRole('alertdialog').waitFor();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Reset Polls to Paused' })
    .click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  mockCardRemoval();
  await page.getByText('Insert a poll worker card to resume voting.').waitFor();
  await screenshot('voting-paused');

  // Resume voting.
  logInAsPollWorker(election);
  await page.getByText('Do you want to resume voting?').waitFor();
  await screenshotWithButtonHighlight(
    'Resume Voting',
    'pw-resume-voting-button'
  );
  await page.getByRole('button', { name: 'Resume Voting' }).click();
  await page.getByRole('heading', { name: 'Voting Resumed' }).waitFor({
    timeout: 60000,
  });
  await screenshot('pw-voting-resumed');
  await capturePrintedReport('voting-resumed-report', namer);
  mockCardRemoval();
  await page.getByText('Insert Your Ballot').waitFor();

  mockPdiScannerHandler.insertSheet(fullPdf);
  await page.getByText('Your ballot was counted!').waitFor({ timeout: 15000 });

  // Pause voting.
  logInAsPollWorker(election);
  await page.getByText('Do you want to close the polls?').waitFor();
  await screenshotWithButtonHighlight('Menu', 'pw-menu-button');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Pause Voting' }).waitFor();
  await screenshotWithButtonHighlight('Pause Voting', 'pw-pause-voting-button');
  await page.getByRole('button', { name: 'Pause Voting' }).click();
  await page.getByRole('heading', { name: 'Voting Paused' }).waitFor({
    timeout: 60000,
  });
  await screenshot('pw-voting-paused');
  await capturePrintedReport('voting-paused-report', namer);
  mockCardRemoval();
  await page.getByText('Insert a poll worker card to resume voting.').waitFor();

  // Resume voting again (no new screenshots needed).
  logInAsPollWorker(election);
  await page.getByText('Do you want to resume voting?').waitFor();
  await page.getByRole('button', { name: 'Resume Voting' }).click();
  await page.getByRole('heading', { name: 'Voting Resumed' }).waitFor({
    timeout: 60000,
  });
  mockCardRemoval();
  await page.getByText('Insert Your Ballot').waitFor();

  mockPdiScannerHandler.insertSheet(fullPdf);
  await page.getByText('Your ballot was counted!').waitFor({ timeout: 15000 });

  // Closing polls flow (multi-batch).
  logInAsPollWorker(election);
  await page.getByText('Do you want to close the polls?').waitFor();
  await page.getByRole('button', { name: 'Close Polls' }).click();
  await page.getByRole('heading', { name: 'Polls Closed' }).waitFor({
    timeout: 60000,
  });
  await capturePrintedReport('polls-closed-report-multi-batch', namer);

  mockCardRemoval();
  await page.getByText('Voting is complete.').waitFor();
});

test('accessibility', async ({ page }, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  const fixtureSet = electionFamousNames2021Fixtures;
  const usbHandler = getMockUsbDriveHandler();
  const { screenshot } = buildIntegrationTestHelper(page, namer);

  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    disableVoterHelpButtons: true,
    // Screen reader enabled so the Audio settings tab is visible.
    precinctScanDisableScreenReaderAudio: false,
  };

  await page.goto('/');
  await logInAsElectionManager(page, fixtureSet.readElection());
  usbHandler.insert(
    await mockElectionPackageFileTree(
      fixtureSet.electionJson.toElectionPackage(systemSettings)
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

  logInAsPollWorker(fixtureSet.readElection());
  await page.getByRole('button', { name: 'Open Polls' }).click();
  await page
    .getByRole('heading', { name: 'Polls Opened' })
    .waitFor({ timeout: 60000 });

  mockCardRemoval();
  await page.getByText('Insert Your Ballot').waitFor();

  // PAT calibration tutorial — triggered by first PAT key press on the voter screen.
  await page.keyboard.press('1');
  await page.getByRole('heading', { name: 'Test Your Device' }).waitFor();
  await screenshot('pat-intro');

  await page.keyboard.press('1');
  await page
    .getByRole('heading', { name: /Identify the .Move. Input/ })
    .waitFor();
  await screenshot('pat-identify-move');

  await page.keyboard.press('1');
  await page
    .getByRole('heading', { name: /Input Identified: .Move./ })
    .waitFor();
  await screenshot('pat-move-identified');

  await page.keyboard.press('1');
  await page
    .getByRole('heading', { name: /Identify the .Select. Input/ })
    .waitFor();
  await screenshot('pat-identify-select');

  await page.keyboard.press('2');
  await page
    .getByRole('heading', { name: /Input Identified: .Select./ })
    .waitFor();
  await screenshot('pat-select-identified');

  await page.keyboard.press('2');
  await page
    .getByRole('heading', { name: 'Device Inputs Identified' })
    .waitFor();
  await screenshot('pat-device-identified');

  // Navigate to and select "Continue" using PAT inputs to exit the tutorial.
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await page.getByText('Insert Your Ballot').waitFor();

  // Audio settings tab — only visible when screen reader is enabled.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Audio' }).waitFor();
  await page.getByRole('tab', { name: 'Audio' }).click();
  await page.getByRole('tab', { name: 'Audio', selected: true }).waitFor();
  await screenshot('a11y-settings-audio');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByText('Insert Your Ballot').waitFor();
});

test('write-in-report', async ({ page }, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  const fixtureSet = electionFamousNames2021Fixtures;
  const electionDefinition = fixtureSet.readElectionDefinition();
  const { election } = electionDefinition;
  const usbHandler = getMockUsbDriveHandler();
  const { screenshot, screenshotWithButtonHighlight } =
    buildIntegrationTestHelper(page, namer);

  // Enables the "Print Write-In Image Report" button on the poll worker screen
  // after polls close.
  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    precinctScanEnableWriteInImageReport: true,
  };

  const candidateContests = election.contests.filter(
    (c): c is CandidateContest => c.type === 'candidate' && !!c.allowWriteIns
  );
  const singleSeatContest = candidateContests.find((c) => c.seats === 1);
  const multiSeatContest = candidateContests.find((c) => c.seats > 1);
  /* istanbul ignore next */
  if (!singleSeatContest || !multiSeatContest) {
    throw new Error('Expected single- and multi-seat write-in contests');
  }

  // Two ballots producing a non-uniform write-in report: one single-seat
  // contest with a single write-in, and one multi-seat contest with two
  // distinct write-ins.
  const fullVotes = createFullyVotedBallot(electionDefinition, '1-1');
  const ballotSpec = {
    electionDefinition,
    ballotStyleId: '1-1',
    precinctId: '20',
  } as const;
  const [writeInPdfA, writeInPdfB] = await renderMarkedBallots([
    {
      ...ballotSpec,
      votes: withWriteIns(fullVotes, singleSeatContest, ['BOB']),
    },
    {
      ...ballotSpec,
      votes: withWriteIns(fullVotes, multiSeatContest, ['ALICE', 'CARLOS']),
    },
  ]);

  await page.goto('/');
  await logInAsElectionManager(page, election);
  usbHandler.insert(
    await mockElectionPackageFileTree({ electionDefinition, systemSettings })
  );
  await page.getByText('Election Manager Menu').waitFor();
  await page.getByLabel(/select a polling place/i).click({ force: true });
  await page.getByText('West Lincoln', { exact: true }).click();
  await page.locator('.search-select').getByText('West Lincoln').waitFor();
  await page.getByText('Official Ballot Mode').click();
  await page.getByText('Test Ballot Mode').waitFor();

  mockCardRemoval();
  await page.getByText('Insert a poll worker card to open polls.').waitFor();

  logInAsPollWorker(election);
  await page.getByRole('button', { name: 'Open Polls' }).click();
  await page
    .getByRole('heading', { name: 'Polls Opened' })
    .waitFor({ timeout: 60000 });

  mockCardRemoval();
  await page.getByText('Insert Your Ballot').waitFor();

  // Scan each ballot, inserting the next as soon as the count advances rather
  // than waiting for the "Insert Your Ballot" screen (see the voting test). We
  // assert on the count rather than the "counted" text, which is identical
  // between consecutive successful scans.
  const writeInPdfs = [writeInPdfA, writeInPdfB];
  for (const [index, writeInPdf] of writeInPdfs.entries()) {
    mockPdiScannerHandler.insertSheet(writeInPdf);
    await expect(page.getByTestId('ballot-count')).toHaveText(
      String(index + 1),
      { timeout: 15000 }
    );
  }
  await page.getByText('Insert Your Ballot').waitFor({ timeout: 15000 });

  // Close polls.
  logInAsPollWorker(election);
  await page.getByText('Do you want to close the polls?').waitFor();
  await page.getByRole('button', { name: 'Close Polls' }).click();
  await page.getByRole('heading', { name: 'Polls Closed' }).waitFor({
    timeout: 60000,
  });

  mockCardRemoval();
  await page.getByText('Voting is complete.').waitFor();

  // Poll worker menu after polls are closed — print the write-in image report.
  logInAsPollWorker(election);
  await page
    .getByText('Voting is complete and the polls cannot be reopened.')
    .waitFor();
  await screenshotWithButtonHighlight(
    'Print Write-In Image Report',
    'pw-print-write-in-image-report-button'
  );
  await page
    .getByRole('button', { name: 'Print Write-In Image Report' })
    .click();
  await page.getByText('Write-In Image Report Printed').waitFor();
  await screenshot('pw-write-in-image-report-printed');
  await capturePrintedReport('write-in-image-report', namer);
});
