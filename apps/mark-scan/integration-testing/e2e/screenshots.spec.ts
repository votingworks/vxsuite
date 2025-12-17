import { test } from '@playwright/test';
import {
  clearTemporaryRootDir,
  electionFamousNames2021Fixtures,
  electionPrimaryPrecinctSplitsFixtures,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import {
  mockCardRemoval,
  mockPollWorkerCardInsertion,
} from '@votingworks/auth';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { buildIntegrationTestHelper } from '@votingworks/test-utils';
import { safeParseInt } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import {
  forceUnconfigure,
  logInAsElectionManager,
  logInAsSystemAdministrator,
} from '../support/auth';

test.beforeAll(setupTemporaryRootDir);
test.afterAll(clearTemporaryRootDir);

test.beforeEach(async ({ page }) => {
  getMockFileUsbDriveHandler().cleanup();
  await page.clock.install();
  await forceUnconfigure(page);
});

test('everything but voting', async ({ page }) => {
  const usbHandler = getMockFileUsbDriveHandler();
  const fixtureSet = electionFamousNames2021Fixtures;
  const electionDefinition = fixtureSet.readElectionDefinition();
  const { election } = electionDefinition;

  const {
    screenshot,
    screenshotWithFocusHighlight,
    withContainerVerticallyExpanded,
    clickModalButton,
  } = buildIntegrationTestHelper(page);

  usbHandler.insert();

  await page.goto('/');
  await page
    .getByText('Insert an election manager card to configure VxMarkScan')
    .waitFor();

  await logInAsSystemAdministrator(page);
  await screenshot('sa-menu');
  await screenshotWithFocusHighlight(
    'Diagnostics',
    'sa-menu-diagnostics-button'
  );
  await screenshotWithFocusHighlight('Save Logs', 'sa-menu-save-logs-button');

  await page.getByText('Diagnostics').click();

  // Screenshot the full scrollable main element
  await page.locator('main').waitFor();
  await withContainerVerticallyExpanded('main', async () => {
    await screenshot('diagnostics-menu-full');
  });

  await page.getByText('Test Accessible Controller').click();
  await page.getByText('Accessible Controller Test').waitFor();
  await screenshot('accessible-controller-test');

  await page.getByText('Cancel Test').click();
  await page.getByText('Test Printer-Scanner').click();
  await page.getByRole('heading', { name: 'Printer-Scanner Test' }).waitFor();
  await screenshot('printer-scanner-test');

  await page.getByText('Cancel Test').click();
  await page.getByText('Test PAT Input').click();
  await page.getByText('Connect PAT Device').waitFor();
  await screenshot('pat-test');

  await page.getByText('Cancel Test').click();
  await page.getByText('Test Front Headphone Input').click();
  await page.getByText('Front Headphone Input Test').waitFor();
  await screenshot('front-headphone-test');

  await page.getByText('Sound is Audible').click();
  await page.getByText('Test Uninterruptible Power Supply').click();
  await page.getByText('Uninterruptible Power Supply Test').waitFor();
  await screenshot('ups-test');

  await page.getByText('UPS Is Fully Charged').click();
  await page.getByText('Save Readiness Report').click();
  await screenshot('save-readiness-report-prompt');
  await page.getByText('Save', { exact: true }).click();
  await page.getByText('Readiness Report Saved').waitFor();
  await screenshot('save-readiness-report-done');
  await page.getByText('Close').click();
  usbHandler.remove();

  await page.getByText('Back').click();
  mockCardRemoval();
  await page.getByText(/election manager card/).waitFor();
  await screenshot('em-insert-card');

  await logInAsElectionManager(page, election);
  await page.getByText(/a USB drive/).waitFor();
  await screenshot('em-insert-usb');

  usbHandler.insert(
    await mockElectionPackageFileTree(fixtureSet.toElectionPackage())
  );
  await page.getByText('Election Manager Menu').waitFor();
  await screenshot('em-menu');
  await screenshotWithFocusHighlight(
    'Diagnostics',
    'em-menu-diagnostics-button'
  );
  await screenshotWithFocusHighlight('Save Logs', 'em-menu-save-logs-button');
  await screenshotWithFocusHighlight(
    'Unconfigure Machine',
    'em-menu-unconfigure-machine-button'
  );
  await screenshotWithFocusHighlight(
    'Official Ballot Mode',
    'em-menu-official-ballot-mode-button'
  );

  await page.getByText('Official Ballot Mode').click();
  await screenshotWithFocusHighlight(
    'Test Ballot Mode',
    'em-menu-test-ballot-mode-button'
  );

  await page.getByText('Select a precinct…').click({ force: true });
  await page.getByText('North Lincoln', { exact: true }).click();

  mockCardRemoval();
  await page.getByText(/poll worker card/).waitFor();
  await screenshot('pw-insert-card-closed-initial');

  // opening, pausing, and resuming
  mockPollWorkerCardInsertion({ election });
  await page.getByText('Poll Worker Menu').waitFor();
  await screenshot('pw-menu-closed-initial');

  await screenshotWithFocusHighlight('Open Polls', 'pw-menu-open-polls-button');

  await page.getByText('Open Polls').click();
  await screenshotWithFocusHighlight(
    'Open Polls',
    'pw-menu-open-polls-confirm-button'
  );

  await clickModalButton('Open Polls');
  await page.getByText('Close Polls').waitFor();
  await screenshot('pw-menu-opened-polls');
  await screenshotWithFocusHighlight(
    'Pause Voting',
    'pw-menu-pause-voting-button'
  );

  await page.getByText('Pause Voting').click();
  await screenshotWithFocusHighlight(
    'Pause Voting',
    'pw-menu-pause-voting-confirm-button'
  );

  await clickModalButton('Pause Voting');
  await page.getByText('Resume Voting').waitFor();
  await screenshot('pw-menu-paused-voting');
  await screenshotWithFocusHighlight(
    'Resume Voting',
    'pw-menu-resume-voting-button'
  );

  await page.getByText('Resume Voting').click();
  await screenshotWithFocusHighlight(
    'Resume Voting',
    'pw-menu-resume-voting-confirm-button'
  );
  await clickModalButton('Resume Voting');

  // poll worker starts voting session
  await screenshotWithFocusHighlight(
    /Start Voting Session/,
    'pw-ballot-style-selection'
  );
  await page.getByText(/Start Voting Session/).click();
  await page.getByText('Load Ballot Sheet').waitFor();
  await screenshot('pw-load-ballot-sheet');
  await page.getByText('Loading Sheet').waitFor();
  await screenshot('pw-loading-sheet');
  await page.getByText(/Remove Card/).waitFor();
  await screenshot('pw-remove-card-to-vote');
  mockCardRemoval();

  // voting session screenshots handled in separate test
  await page.getByText('Start Voting').waitFor();
  await screenshot('voting-start-screen');
  mockPollWorkerCardInsertion({ election });
  await page.getByText('Cancel Voting Session').click();

  // closing
  await page.getByText('Close Polls').waitFor();
  await screenshotWithFocusHighlight(
    'Close Polls',
    'pw-menu-close-polls-button'
  );

  await page.getByText('Close Polls').click();
  await screenshotWithFocusHighlight(
    'Close Polls',
    'pw-menu-close-polls-confirm-button'
  );

  await clickModalButton('Close Polls');
  await page.getByText('Polls: Closed').waitFor();
  mockCardRemoval();
});

test('voting session', async ({ page }) => {
  const usbHandler = getMockFileUsbDriveHandler();
  const fixtureSet = electionPrimaryPrecinctSplitsFixtures;
  const electionDefinition = fixtureSet.readElectionDefinition();
  const { election } = electionDefinition;

  const { screenshot, screenshotWithFocusHighlight, clickModalButton } =
    buildIntegrationTestHelper(page);

  // Helper: Get contest metadata from UI
  async function getContestInfo(): Promise<{ current: number; total: number }> {
    const contestText = await page
      .getByText(/Contest number: \d+ \| Total contests: \d+/)
      .first()
      .textContent();

    // Extract "Contest number: X | Total contests: Y" format
    const match = contestText?.match(
      /Contest number: (\d+) \| Total contests: (\d+)/
    );
    const current = safeParseInt(match?.[1] ?? '0').unsafeUnwrap();
    const total = safeParseInt(match?.[2] ?? '0').unsafeUnwrap();

    return { current, total };
  }

  await page.goto('/');
  await page
    .getByText('Insert an election manager card to configure VxMarkScan')
    .waitFor();

  // Configure machine as Election Manager
  await logInAsElectionManager(page, election);
  await page.getByText(/a USB drive/).waitFor();

  usbHandler.insert(
    await mockElectionPackageFileTree(fixtureSet.toElectionPackage())
  );
  await page.getByText('Election Manager Menu').waitFor();

  await page.getByText('Official Ballot Mode').click();
  await page.getByText('Select a precinct…').click({ force: true });
  await page.getByText('Precinct 1', { exact: true }).click();

  // Open polls as Poll Worker
  mockCardRemoval();
  await page.getByText(/poll worker card/).waitFor();

  mockPollWorkerCardInsertion({ election });
  await page.getByText('Poll Worker Menu').waitFor();

  await page.getByText('Open Polls').click();
  await clickModalButton('Open Polls');
  await page.getByText('Close Polls').waitFor();

  // Start voting session - select Fish party
  await page.getByText('Fish').click();
  await page.getByText(/Remove Card/).waitFor();
  mockCardRemoval();

  /**
   * Initiate Voting Session
   */
  await page.getByText('Start Voting').waitFor();
  await screenshot('voting-start-screen');

  await page.getByText('Start Voting').click();

  // Wait for contest metadata to appear
  await page
    .getByText(/Contest number: \d+ \| Total contests: \d+/)
    .first()
    .waitFor();

  // Get total number of contests
  const { total: totalContests } = await getContestInfo();

  /**
   * Language Selection
   */
  await screenshotWithFocusHighlight(/English/, 'voting-language-button');
  await page.getByRole('button', { name: /English/ }).click();
  await screenshot('voting-languages');

  const spanishOption = page.getByText(/Español/i);
  assert((await spanishOption.count()) > 0);
  await screenshotWithFocusHighlight(
    /Español/i,
    'voting-language-spanish-option'
  );
  await spanishOption.click();
  await page.getByText('Done', { exact: true }).click();
  await screenshot('voting-in-spanish');

  // Revert to English
  await page.getByRole('button', { name: /Español/i }).click();
  await page.getByText(/English/i).click();
  await page.getByText('Done', { exact: true }).click();

  // Wait for contest to be back in English
  await page
    .getByText(/Contest number: \d+ \| Total contests: \d+/)
    .first()
    .waitFor();

  /**
   * Accessibility Settings
   */
  await page.getByRole('button', { name: /Settings/i }).waitFor();
  await screenshotWithFocusHighlight(/Settings/i, 'voting-settings-button');
  await page.getByRole('button', { name: /Settings/i }).click();
  await screenshot('voting-settings-color');

  // Capture all color theme options
  const colorThemeOptions = page.getByRole('button').getByText(/background/);
  const colorThemeCount = await colorThemeOptions.count();

  for (let i = 0; i < colorThemeCount; i += 1) {
    await colorThemeOptions.nth(i).click();
    await screenshot(`voting-settings-color-theme-${i + 1}`);
  }

  // Reset to defaults
  await page.getByText('Reset', { exact: true }).click();

  // Test text size
  await page.getByText('Text Size', { exact: true }).click();
  await screenshot('voting-settings-text-size');

  // Capture all text size options
  const textSizeOptions = page.getByText(/Aa/);
  const textSizeCount = await textSizeOptions.count();

  for (let i = 0; i < textSizeCount; i += 1) {
    await textSizeOptions.nth(i).click();
    await screenshot(`voting-settings-text-size-${i + 1}`);
  }

  // Reset to defaults and close
  await page.getByText('Reset', { exact: true }).click();

  await page.getByText('Audio').click();
  await screenshot('voting-settings-audio');
  await screenshotWithFocusHighlight(
    'Mute Audio',
    'voting-settings-mute-audio-button'
  );
  await screenshotWithFocusHighlight(
    'Enable Audio-Only Mode',
    'voting-settings-mute-audio-button'
  );
  await page.getByText('Enable Audio-Only Mode').click();
  await screenshot('voting-settings-audio-only-mode');
  await page.getByText('Exit Audio-Only Mode').click();

  /**
   * Navigate Contests
   */

  // Track whether we've captured the next screenshot
  let capturedNextButton = false;

  // Navigate through all contests
  for (let contestNum = 1; contestNum <= totalContests; contestNum += 1) {
    const { current } = await getContestInfo();
    // Verify we're on the expected contest
    if (current !== contestNum) {
      throw new Error(
        `Expected contest ${contestNum} but on contest ${current}`
      );
    }

    const optionCount = await page.getByRole('option').count();
    const options = page.getByRole('option');

    // Make selection deterministically (use modulo for index)
    const selectionIndex = contestNum % optionCount;
    await options.nth(selectionIndex).click();
    await page.waitForTimeout(100);

    // Screenshot the contest with selections
    await screenshot(`voting-contest-${contestNum}`);

    // Capture Next button on first contest
    if (!capturedNextButton && contestNum < totalContests) {
      await screenshotWithFocusHighlight(/Next/, 'voting-contest-next-button');
      capturedNextButton = true;
    }

    await page.getByRole('button', { name: /Next/ }).click();
    await page.waitForTimeout(100); // Brief wait for navigation
  }

  // Pre-Print Review screen
  await page.getByText('Print My Ballot').waitFor();
  await screenshot('voting-pre-print-review');

  // Print ballot
  await page.getByText('Print My Ballot').click();
  await page.getByText(/Printing/).waitFor();
  await screenshot('voting-printing');

  // Post-Print Cast instructions
  await page.getByText('Cast My Ballot').waitFor();
  await screenshot('voting-post-print-review');

  await page.getByText('Cast My Ballot').click();
  await page.getByText(/Casting/).waitFor();
  await screenshot('voting-casting-ballot');

  await page.getByText('Thank you for voting.').waitFor();
  await screenshot('voting-ballot-cast');

  await page.clock.fastForward(5_000);
  await page.getByText('Insert Card').waitFor();
});
