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
import {
  AdjudicationReason,
  CandidateContest,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  VotesDict,
} from '@votingworks/types';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import {
  forceLogOutAndResetElectionDefinition,
  logInAsElectionManager,
  logInAsPollWorker,
  logInAsSystemAdministrator,
} from './support/auth';
import {
  createFullyVotedBallot,
  renderMarkedBallots,
  withOvervote,
  withUndervote,
} from './support/render_marked_ballot';
import { mockPdiScannerHandler } from './support/scanner';

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
  const electionDefinition = fixtureSet.readElectionDefinition();
  const { election } = electionDefinition;
  const usbHandler = getMockFileUsbDriveHandler();
  const {
    screenshot,
    screenshotWithButtonHighlight,
    screenshotWithLocatorHighlight,
  } = buildIntegrationTestHelper(page, screenshotCounter);

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

  // Successful scan: full votes, capture scanning screen then counted screen.
  mockPdiScannerHandler.insertSheet(fullPdf);
  await page.getByText('Please wait').waitFor({ timeout: 15000 });
  await screenshot('scanning');
  await page.getByText('Your ballot was counted!').waitFor({ timeout: 30000 });
  await screenshot('ballot-counted');
  await page.getByText('Insert Your Ballot').waitFor({ timeout: 30000 });

  // Blank ballot warning.
  mockPdiScannerHandler.insertSheet(blankPdf);
  await page
    .getByRole('heading', { name: 'Review Your Ballot' })
    .waitFor({ timeout: 30000 });
  await screenshot('blank-ballot-warning');
  await page.getByRole('button', { name: 'Cast Ballot' }).click();
  await page.getByText('Insert Your Ballot').waitFor({ timeout: 30000 });

  // Undervote warning.
  mockPdiScannerHandler.insertSheet(undervotePdf);
  await page
    .getByRole('heading', { name: 'Review Your Ballot' })
    .waitFor({ timeout: 30000 });
  await screenshot('undervote-warning');
  await page.getByRole('button', { name: 'Cast Ballot' }).click();
  await page.getByText('Insert Your Ballot').waitFor({ timeout: 30000 });

  // Overvote warning.
  mockPdiScannerHandler.insertSheet(overvotePdf);
  await page
    .getByRole('heading', { name: 'Review Your Ballot' })
    .waitFor({ timeout: 30000 });
  await screenshot('overvote-warning');
  await page.getByRole('button', { name: 'Cast Ballot' }).click();
  await page.getByText('Insert Your Ballot').waitFor({ timeout: 30000 });

  // Mixed overvote + undervote warning.
  mockPdiScannerHandler.insertSheet(mixedPdf);
  await page
    .getByRole('heading', { name: 'Review Your Ballot' })
    .waitFor({ timeout: 30000 });
  await screenshot('mixed-overvote-undervote-warning');
  await page.getByRole('button', { name: 'Cast Ballot' }).click();
  await page.getByText('Insert Your Ballot').waitFor({ timeout: 30000 });

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
});
