import { resolve } from 'node:path';
import test from '@playwright/test';
import { sleep } from '@votingworks/basics';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { getMockUsbDriveHandler } from '@votingworks/usb-drive';
import {
  clearTemporaryRootDir,
  electionFamousNames2021Fixtures,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import * as grout from '@votingworks/grout';
import type { Api as DevDockApi } from '@votingworks/dev-dock-backend';
import {
  buildIntegrationTestHelper,
  captureReadinessReport,
  createFullyVotedBallot,
  createScreenshotNamer,
  renderFoldedCornerSheet,
  renderMarkedBallots,
  withOvervote,
  withUndervote,
} from '@votingworks/integration-test-utils';
import {
  AdjudicationReason,
  CandidateContest,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
} from '@votingworks/types';
import {
  forceLogOutAndResetElectionDefinition,
  logInAsElectionManager,
} from './support/auth';

const BALLOT_STYLE_ID = '1-1';
const PRECINCT_ID = '20';

// A real blank-sheet scan (front + back) that passes the scanner's blank-paper
// diagnostic — a synthetic all-white image fails the interpreter's paper-edge
// detection, so we feed an actual scanned blank sheet for both sides.
const BLANK_SHEET_FIXTURE_DIR = resolve(
  __dirname,
  '../../../../libs/ballot-interpreter/test/fixtures/diagnostic/blank/20lb'
);
const BLANK_SHEET_FRONT = resolve(
  BLANK_SHEET_FIXTURE_DIR,
  'bc0367d0-444a-4f1b-a88e-78de0bda5cb5-front.jpg'
);
const BLANK_SHEET_BACK = resolve(
  BLANK_SHEET_FIXTURE_DIR,
  'bc0367d0-444a-4f1b-a88e-78de0bda5cb5-back.jpg'
);

const devDockClient = grout.createClient<DevDockApi>({
  baseUrl: 'http://127.0.0.1:3001/dock',
});

test.beforeAll(setupTemporaryRootDir);
test.afterAll(clearTemporaryRootDir);

test.beforeEach(async ({ page }) => {
  await forceLogOutAndResetElectionDefinition(page);
  getMockUsbDriveHandler().cleanup();
});

test('screenshots', async ({ page }, testInfo) => {
  const namer = createScreenshotNamer(testInfo);
  const fixtureSet = electionFamousNames2021Fixtures;
  const electionDefinition = fixtureSet.readElectionDefinition();
  const { election } = electionDefinition;
  const usbHandler = getMockUsbDriveHandler();
  const {
    screenshot,
    screenshotWithButtonHighlight,
    screenshotWithLocatorHighlight,
    withContainerVerticallyExpanded,
  } = buildIntegrationTestHelper(page, namer);

  // Enable adjudication so scanned ballots with these conditions pause on the
  // "Ballot Not Counted" eject screen instead of being silently counted.
  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    centralScanAdjudicationReasons: [
      AdjudicationReason.Overvote,
      AdjudicationReason.Undervote,
      AdjudicationReason.BlankBallot,
    ],
  };

  // Pre-render every ballot variant in one Chromium instance. A single-seat
  // candidate contest gives us a clean overvote (extra candidate) and undervote
  // (blanked) without affecting other contests.
  const singleSeatContest = election.contests.find(
    (c): c is CandidateContest => c.type === 'candidate' && c.seats === 1
  );
  /* istanbul ignore next */
  if (!singleSeatContest) throw new Error('Expected a single-seat contest');

  const fullVotes = createFullyVotedBallot(electionDefinition, BALLOT_STYLE_ID);
  const ballotSpec = {
    electionDefinition,
    ballotStyleId: BALLOT_STYLE_ID,
    precinctId: PRECINCT_ID,
  } as const;
  const [fullPdf, overvotePdf, blankPdf, undervotePdf] =
    await renderMarkedBallots([
      { ...ballotSpec, votes: fullVotes },
      { ...ballotSpec, votes: withOvervote(fullVotes, singleSeatContest) },
      { ...ballotSpec, votes: {} },
      { ...ballotSpec, votes: withUndervote(fullVotes, singleSeatContest) },
    ]);
  // An "unreadable" sheet that still looks like a ballot: a folded corner
  // obscures the timing marks, with the ballot's real back page behind it.
  const foldedCornerSheet = await renderFoldedCornerSheet(fullPdf);

  // Scans a batch of counted (fully-voted) ballots and waits for it to finish.
  let expectedSheets = 0;
  async function scanCountedBatch(paths: string[]) {
    await devDockClient.batchScannerClearBallots();
    await devDockClient.batchScannerLoadBallots({ paths });
    await page.getByRole('button', { name: 'Scan New Batch' }).click();
    expectedSheets += paths.length;
    await page
      .getByText(`Total Sheets: ${expectedSheets}`)
      .waitFor({ timeout: 60000 });
  }

  // Unconfigured: insert election manager card.
  await page.getByText(/election manager card to configure/).waitFor();
  await screenshot('unconfigured-screen');

  // Insert USB drive containing the election package.
  await logInAsElectionManager(page, election);
  await page.getByText(/a USB drive/).waitFor();
  await screenshot('em-insert-usb');

  // Configuring progress screen. The configuration request completes too
  // quickly to screenshot reliably, so delay the response just long enough to
  // capture the screen, then let it proceed.
  await page.route(
    '**/api/configureFromElectionPackageOnUsbDrive',
    async (route) => {
      await sleep(4000);
      await route.continue();
    }
  );
  usbHandler.insert(
    await mockElectionPackageFileTree(
      fixtureSet.electionJson.toElectionPackage(systemSettings)
    )
  );
  await page.getByText(/Configuring VxCentralScan/).waitFor();
  await screenshot('configuring');
  await page.unroute('**/api/configureFromElectionPackageOnUsbDrive');
  await page.getByText('No ballots have been scanned').waitFor();

  // Scan Ballots screen immediately after configuring, while still in test
  // mode (the switch to official mode happens below). Capture it plain, then
  // with the election info in the left-nav sidebar highlighted.
  await screenshot('scan-ballots-test-mode');
  await screenshotWithLocatorHighlight(
    page.getByTestId('electionInfo'),
    'scan-ballots-test-mode-election-info-highlight'
  );

  // Settings screen. Capture the "Official Ballot Mode" toggle highlighted
  // while still in test mode, then switch to official mode — this removes the
  // test-mode banner from every subsequent screenshot and makes the official
  // ballots we scan below match the scanner mode. Switching now is free of a
  // confirmation prompt since no batches have been scanned yet.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Unconfigure Machine' }).waitFor();
  await screenshotWithButtonHighlight(
    'Official Ballot Mode',
    'em-settings-official-ballot-mode-button'
  );
  const officialModeOption = page.getByRole('option', {
    name: 'Official Ballot Mode',
  });
  if ((await officialModeOption.getAttribute('aria-selected')) !== 'true') {
    await officialModeOption.click();
    await page
      .getByRole('option', { name: 'Official Ballot Mode', selected: true })
      .waitFor();
  }

  await screenshot('em-settings');
  await screenshotWithButtonHighlight(
    'Unconfigure Machine',
    'em-settings-unconfigure-machine-button'
  );
  await page.getByRole('button', { name: 'Unconfigure Machine' }).click();
  await screenshotWithButtonHighlight(
    'Delete All Election Data',
    'em-settings-confirm-unconfigure-button'
  );
  await page.getByRole('button', { name: 'Cancel' }).click();
  await screenshotWithButtonHighlight(
    'Save Logs',
    'em-settings-save-logs-button'
  );

  // Empty Scan Ballots screen and its call-to-action highlights.
  await page.getByRole('button', { name: 'Scan Ballots' }).click();
  await page.getByText('No ballots have been scanned').waitFor();
  await screenshot('scan-ballots-empty');
  await screenshotWithLocatorHighlight(
    page.getByText('No ballots have been scanned'),
    'scan-ballots-empty-no-ballots-highlight'
  );
  await screenshotWithButtonHighlight(
    'Scan New Batch',
    'scan-ballots-empty-scan-new-batch-button'
  );

  // Scan several non-trivial batches so the Scan Ballots screen looks like
  // real use.
  await scanCountedBatch(Array.from({ length: 9 }, () => fullPdf));
  await scanCountedBatch(Array.from({ length: 18 }, () => fullPdf));
  await scanCountedBatch(Array.from({ length: 6 }, () => fullPdf));
  await screenshot('scan-ballots-with-batches');

  // Adjudication: scan one batch of problem ballots and capture each eject
  // state. Each "Confirm Ballot Removed" advances to the next review sheet.
  // The order the scanner surfaces them in isn't guaranteed, so detect which
  // state is showing rather than assuming a fixed sequence. A good ballot leads
  // the batch (and counts without pausing) so the batch isn't left at 0 sheets
  // after every problem ballot is removed.
  await devDockClient.batchScannerClearBallots();
  await devDockClient.batchScannerLoadBallots({
    paths: [
      fullPdf,
      overvotePdf,
      blankPdf,
      undervotePdf,
      // Front + back of the folded-corner sheet; the dev dock pairs trailing
      // image paths into a single sheet (after the PDFs above).
      foldedCornerSheet.frontPath,
      foldedCornerSheet.backPath,
    ],
  });
  await page.getByRole('button', { name: 'Scan New Batch' }).click();

  const remainingEjectStates = new Map([
    ['Overvote', 'adjudication-overvote'],
    ['Blank Ballot', 'adjudication-blank-ballot'],
    ['Undervote', 'adjudication-undervote'],
    ['Unreadable', 'adjudication-unreadable'],
  ]);
  while (remainingEjectStates.size > 0) {
    await page.getByText('Ballot Not Counted').waitFor({ timeout: 60000 });

    let shownHeading: string | undefined;
    for (const heading of remainingEjectStates.keys()) {
      if (
        await page
          .getByRole('heading', { name: heading, exact: true })
          .isVisible()
      ) {
        shownHeading = heading;
        break;
      }
    }
    /* istanbul ignore next */
    if (!shownHeading) throw new Error('Unrecognized adjudication state');

    await screenshot(remainingEjectStates.get(shownHeading) as string);
    remainingEjectStates.delete(shownHeading);

    await page.getByRole('button', { name: 'Confirm Ballot Removed' }).click();
    // Wait for this state to clear before detecting the next one.
    await page
      .getByRole('heading', { name: shownHeading, exact: true })
      .waitFor({ state: 'hidden', timeout: 60000 });
  }

  // Back on Scan Ballots with batches present: highlight Save CVRs.
  await page.getByText('No ballots have been scanned').waitFor({
    state: 'hidden',
  });
  await screenshotWithButtonHighlight(
    'Save CVRs',
    'scan-ballots-save-cvrs-button'
  );

  // Diagnostics screen. Run the UPS and scanner diagnostics first so the
  // readiness report has real results, then capture the full-height screen.
  // The content scrolls within MainContent (the last child of <main>), not the
  // <main> element itself, so expand that container.
  await page.getByRole('button', { name: 'Diagnostics' }).click();
  await page.getByRole('button', { name: 'Save Readiness Report' }).waitFor();

  // UPS diagnostic: confirm the power supply is connected.
  await page
    .getByRole('button', { name: 'Test Uninterruptible Power Supply' })
    .click();
  await page.getByRole('button', { name: 'Yes' }).click();

  // Scanner diagnostic: feed a blank white sheet (both sides) and run the test
  // scan.
  await devDockClient.batchScannerClearBallots();
  await devDockClient.batchScannerLoadBallots({
    paths: [BLANK_SHEET_FRONT, BLANK_SHEET_BACK],
  });
  await page.getByRole('button', { name: 'Perform Test Scan' }).click();
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Test Scan Successful' })
    .waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Close' }).click();

  await withContainerVerticallyExpanded('main > div:last-child', async () => {
    await screenshot('diagnostics-screen');
  });

  // Save the readiness report to USB and capture the report PDF itself.
  await page.getByRole('button', { name: 'Save Readiness Report' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Readiness Report Saved' })
    .waitFor({ timeout: 60000 });
  await captureReadinessReport('readiness-report', namer);

  usbHandler.cleanup();
});
