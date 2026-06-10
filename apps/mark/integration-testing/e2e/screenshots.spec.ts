import { Page, expect, test } from '@playwright/test';
import { mockCardRemoval } from '@votingworks/auth';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import {
  clearTemporaryRootDir,
  electionGeneralFixtures,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import {
  MULTI_LANGUAGE_UI_STRINGS,
  buildIntegrationTestHelper,
  captureReadinessReport,
  createScreenshotCounter,
} from '@votingworks/integration-test-utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  Election,
  ElectionDefinition,
} from '@votingworks/types';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import {
  getMockFilePrinterHandler,
  HP_LASER_PRINTER_CONFIG,
} from '@votingworks/printing';
import {
  forceLogOutAndResetElectionDefinition,
  logInAsElectionManager,
  logInAsPollWorker,
  logInAsSystemAdministrator,
} from './support/auth';
import {
  getFamousNamesElectionDefinition,
  getMultiLanguageGeneralElectionDefinition,
} from './support/election';
import { configureMachine, openPolls, voteFullBallot } from './support/flows';
import { capturePrintedBallot } from './support/reports';

const POLLING_PLACE_NAME = 'North Lincoln';

const screenshotCounter = createScreenshotCounter();

test.beforeAll(setupTemporaryRootDir);
test.afterAll(clearTemporaryRootDir);

test.beforeEach(async ({ page }) => {
  getMockFileUsbDriveHandler().cleanup();
  getMockFilePrinterHandler().connectPrinter(HP_LASER_PRINTER_CONFIG);
  await forceLogOutAndResetElectionDefinition(page);
});

// Leave the machine unconfigured and logged out so the next test file inherits
// a clean backend (these tests can end mid-voting-session with polls open).
test.afterEach(async ({ page }) => {
  await forceLogOutAndResetElectionDefinition(page);
});

async function buildElectionPackage(electionDefinition: ElectionDefinition) {
  return mockElectionPackageFileTree({
    electionDefinition,
    systemSettings: {
      ...DEFAULT_SYSTEM_SETTINGS,
      // Hide the voter help button to keep voter screens uncluttered.
      disableVoterHelpButtons: true,
    },
    // Registers the supported languages and their native display names so the
    // voter language selector renders (see MULTI_LANGUAGE_UI_STRINGS).
    uiStrings: MULTI_LANGUAGE_UI_STRINGS,
  });
}

/**
 * Casts a full ballot via the voter flow, capturing the contest, write-in, and
 * review screenshots. Selections are derived from the election definition
 * rather than hardcoded candidate names. Assumes the voter is on the "Start
 * Voting" screen.
 */
async function voteAndCaptureContests(
  page: Page,
  election: Election,
  helper: ReturnType<typeof buildIntegrationTestHelper>
): Promise<void> {
  const { screenshot, screenshotWithButtonHighlight } = helper;
  const { contests } = election;

  await page.getByRole('button', { name: 'Start Voting' }).click();

  let capturedSingleSeat = false;
  let capturedMultiSeat = false;
  let capturedWriteIn = false;

  for (let i = 0; i < contests.length; i += 1) {
    const contest = contests[i];
    await page.getByRole('heading', { name: contest.title }).first().waitFor();

    if (contest.type === 'candidate') {
      const candidateContest = contest;
      const isMultiSeat = candidateContest.seats > 1;

      // Capture the write-in flow on the first single-seat write-in contest,
      // once a plain single-seat selection has already been captured.
      if (
        candidateContest.allowWriteIns &&
        !capturedWriteIn &&
        capturedSingleSeat &&
        !isMultiSeat
      ) {
        await screenshotWithButtonHighlight(
          'add write-in candidate',
          'voting-write-in-button'
        );
        await page.getByText('add write-in candidate').click();
        const dialog = page.getByRole('alertdialog');
        await dialog.waitFor();
        for (const letter of 'NEMO') {
          // Virtual keyboard button names are doubled, e.g. "N N".
          await dialog
            .getByRole('button', { name: `${letter} ${letter}` })
            .click();
        }
        await screenshot('voting-write-in-keyboard');
        await dialog.getByRole('button', { name: 'Accept' }).click();
        await dialog.waitFor({ state: 'hidden' });
        await screenshot('voting-write-in-accepted');
        capturedWriteIn = true;
      } else {
        const options = page.getByRole('option');
        const numToSelect = isMultiSeat ? candidateContest.seats : 1;
        for (let s = 0; s < numToSelect; s += 1) {
          await options.nth(s).click();
        }
        if (!isMultiSeat && !capturedSingleSeat) {
          await screenshot('voting-single-seat-selection');
          capturedSingleSeat = true;
        }
        if (isMultiSeat && !capturedMultiSeat) {
          await screenshot('voting-multi-seat-selections');
          capturedMultiSeat = true;
        }
      }
    }

    // The "Next" button navigates to the review screen after the last contest.
    await page.getByRole('button', { name: 'Next' }).click();
  }
}

test('basic election flow', async ({ page }) => {
  const electionDefinition = getFamousNamesElectionDefinition();
  const { election } = electionDefinition;
  const usbHandler = getMockFileUsbDriveHandler();
  const helper = buildIntegrationTestHelper(page, screenshotCounter);
  const {
    screenshot,
    screenshotWithButtonHighlight,
    screenshotWithLocatorHighlight,
  } = helper;
  const electionPackage = await buildElectionPackage(electionDefinition);

  // Initial configuration screen.
  await page
    .getByText('Insert an election manager card to configure VxMark')
    .waitFor();
  await screenshot('unconfigured-screen');

  // Insert election manager card, then prompt for USB.
  await logInAsElectionManager(page, election);
  await page.getByText(/USB drive/).waitFor();
  await screenshot('em-insert-usb');

  // Insert USB containing the election package.
  usbHandler.insert(electionPackage);
  await page.getByText('Election Manager Menu').waitFor();
  await screenshot('em-menu-no-polling-place');

  // Select a polling place.
  await page.getByLabel(/select a polling place/i).click({ force: true });
  await page.getByText(POLLING_PLACE_NAME, { exact: true }).click();
  await screenshot('em-menu-polling-place-selected');

  // Ballot mode: official highlighted (not selected), select it, then test
  // highlighted (not selected).
  await screenshotWithButtonHighlight(
    'Official Ballot Mode',
    'em-menu-official-ballot-mode-highlighted'
  );
  await page.getByRole('option', { name: 'Official Ballot Mode' }).click();
  await page
    .getByRole('option', { name: 'Official Ballot Mode', selected: true })
    .waitFor();
  await screenshotWithButtonHighlight(
    'Test Ballot Mode',
    'em-menu-test-ballot-mode-highlighted'
  );

  // Remove card → unauthenticated pre-polls-opened screen.
  mockCardRemoval();
  await page.getByText(/poll worker card/).waitFor();
  await screenshot('unauthenticated-polls-closed');

  // Poll worker opens polls.
  logInAsPollWorker(election);
  await page.getByText('Poll Worker Menu').waitFor();
  await screenshot('pw-menu-polls-closed');
  await screenshotWithButtonHighlight(
    'Open Polls',
    'pw-menu-open-polls-highlighted'
  );
  await screenshotWithButtonHighlight(
    'Signed Hash Validation',
    'pw-menu-signed-hash-validation-highlighted'
  );
  await page.getByRole('button', { name: 'Open Polls' }).click();
  await page.getByRole('alertdialog').waitFor();
  await screenshotWithButtonHighlight('Open Polls', 'pw-open-polls-modal');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Open Polls' })
    .click();
  await page.getByRole('button', { name: 'Close Polls' }).waitFor();

  // Remove card → unauthenticated polls-opened screen.
  mockCardRemoval();
  await page.getByText('Insert Card').waitFor();
  await screenshot('unauthenticated-polls-opened');
  await screenshotWithLocatorHighlight(
    page.getByTestId('electionInfoBar'),
    'unauthenticated-polls-opened-election-info'
  );

  // Poll worker starts a voting session.
  logInAsPollWorker(election);
  await page.getByText('Poll Worker Menu').waitFor();
  await screenshot('pw-menu-polls-open');
  await screenshotWithButtonHighlight(
    /Start Voting Session/,
    'pw-start-voting-session-button'
  );
  await page.getByRole('button', { name: /Start Voting Session/ }).click();

  // Poll worker prompted to remove card so the voter can begin.
  await page.getByText('Remove Card to Begin Voting Session').waitFor();
  await screenshot('pw-remove-card-to-begin');

  // Remove card → voter "Start Voting" screen.
  mockCardRemoval();
  await page.getByRole('button', { name: 'Start Voting' }).waitFor();
  await screenshot('voting-start-screen');

  // Vote and capture contest screenshots.
  await voteAndCaptureContests(page, election, helper);

  // Review screen.
  await page.getByRole('heading', { name: 'Review Your Votes' }).waitFor();
  await screenshot('voting-review');

  // Print ballot.
  await page.getByRole('button', { name: 'Print My Ballot' }).click();
  await page.getByText('Printing Your Ballot...').waitFor();
  await screenshot('voting-printing');

  // Post-print success screen.
  await page.getByText('You’re Almost Done').waitFor({ timeout: 15000 });
  await screenshot('voting-almost-done');

  // Capture the ballot that was printed to the mock printer.
  await capturePrintedBallot('printed-ballot', screenshotCounter);

  await page.getByRole('button', { name: 'Done' }).click();

  // Poll worker closes polls.
  await page.getByText('Insert Card').waitFor();
  logInAsPollWorker(election);
  await page.getByText('Poll Worker Menu').waitFor();
  await screenshotWithButtonHighlight(
    'Close Polls',
    'pw-menu-close-polls-highlighted'
  );
  await page.getByRole('button', { name: 'Close Polls' }).click();
  await page.getByRole('alertdialog').waitFor();
  await screenshotWithButtonHighlight('Close Polls', 'pw-close-polls-modal');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Close Polls' })
    .click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  await screenshot('pw-menu-polls-closed-final');

  // Remove card → unauthenticated polls-closed screen.
  mockCardRemoval();
  await page.getByText('Voting is complete.').waitFor();
  await screenshot('unauthenticated-polls-closed-final');

  // Election manager unconfigures the machine.
  await logInAsElectionManager(page, election);
  await page.getByText('Election Manager Menu').waitFor();
  await screenshotWithButtonHighlight(
    'Unconfigure Machine',
    'em-menu-unconfigure-highlighted'
  );
  await page.getByRole('button', { name: 'Unconfigure Machine' }).click();
  await page.getByRole('alertdialog').waitFor();
  await screenshot('em-unconfigure-modal');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete All Election Data' })
    .click();

  // Remove card → back to unconfigured.
  mockCardRemoval();
  await page
    .getByText('Insert an election manager card to configure VxMark')
    .waitFor();
});

test('additional options', async ({ page }) => {
  const electionDefinition = getFamousNamesElectionDefinition();
  const { election } = electionDefinition;
  const helper = buildIntegrationTestHelper(page, screenshotCounter);
  const {
    screenshot,
    screenshotWithButtonHighlight,
    withContainerVerticallyExpanded,
  } = helper;
  const electionPackage = await buildElectionPackage(electionDefinition);

  await page
    .getByText('Insert an election manager card to configure VxMark')
    .waitFor();
  await configureMachine(page, {
    election,
    electionPackage,
    pollingPlaceName: POLLING_PLACE_NAME,
  });

  // Election manager menu system buttons.
  await screenshotWithButtonHighlight(
    'Diagnostics',
    'em-menu-diagnostics-highlighted'
  );
  await screenshotWithButtonHighlight(
    'Save Logs',
    'em-menu-save-logs-highlighted'
  );
  await screenshotWithButtonHighlight(
    'Set Date and Time',
    'em-menu-set-date-time-highlighted'
  );
  await screenshotWithButtonHighlight(
    'Signed Hash Validation',
    'em-menu-signed-hash-validation-highlighted'
  );

  // Diagnostics screen (full height).
  await page.getByRole('button', { name: 'Diagnostics' }).click();
  await page.getByRole('heading', { name: 'System Diagnostics' }).waitFor();
  await withContainerVerticallyExpanded('main', async () => {
    await screenshot('em-diagnostics-full');
  });

  // Save the readiness report to the USB drive, then capture the saved PDF.
  await page.getByRole('button', { name: 'Save Readiness Report' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Save' })
    .click();
  await page.getByText('Readiness Report Saved').waitFor();
  await captureReadinessReport('readiness-report', screenshotCounter);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Close' })
    .click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });

  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByText('Election Manager Menu').waitFor();

  // Open polls.
  mockCardRemoval();
  await page.getByText(/poll worker card/).waitFor();
  await openPolls(page, election);

  // Pause voting.
  await screenshotWithButtonHighlight(
    'Pause Voting',
    'pw-menu-pause-voting-highlighted'
  );
  await page.getByRole('button', { name: 'Pause Voting' }).click();
  await page.getByRole('alertdialog').waitFor();
  await screenshotWithButtonHighlight('Pause Voting', 'pw-pause-voting-modal');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Pause Voting' })
    .click();
  await page.getByRole('button', { name: 'Resume Voting' }).waitFor();

  // Remove card → unauthenticated polls-paused screen.
  mockCardRemoval();
  await page.getByText(/poll worker card/).waitFor();
  await screenshot('unauthenticated-polls-paused');

  // Poll worker menu while paused.
  logInAsPollWorker(election);
  await page.getByText('Poll Worker Menu').waitFor();
  await screenshot('pw-menu-polls-paused');
  await screenshotWithButtonHighlight(
    'Resume Voting',
    'pw-menu-resume-voting-highlighted'
  );
  await page.getByRole('button', { name: 'Resume Voting' }).click();
  await page.getByRole('alertdialog').waitFor();
  await screenshotWithButtonHighlight(
    'Resume Voting',
    'pw-resume-voting-modal'
  );

  // Back out of the resume modal and close polls instead.
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Cancel' })
    .click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Close Polls' }).click();
  await page.getByRole('alertdialog').waitFor();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Close Polls' })
    .click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });

  // Remove card → system administrator menu.
  mockCardRemoval();
  await page.getByText('Voting is complete.').waitFor();
  await logInAsSystemAdministrator(page);
  await screenshotWithButtonHighlight(
    'Diagnostics',
    'sa-menu-diagnostics-highlighted'
  );
  await screenshotWithButtonHighlight(
    'Save Logs',
    'sa-menu-save-logs-highlighted'
  );
  await screenshotWithButtonHighlight(
    'Reset Polls to Paused',
    'sa-menu-reset-polls-to-paused-highlighted'
  );
});

test('voter settings', async ({ page }) => {
  // electionGeneral ships full translations (Chinese, etc.); the helper also
  // tags its ballot styles with a Chinese ballot language so the printed ballot
  // is dual-language (Chinese + English).
  const electionDefinition = getMultiLanguageGeneralElectionDefinition();
  const { election } = electionDefinition;
  const pollingPlaceName = 'Center Springfield';
  const helper = buildIntegrationTestHelper(page, screenshotCounter);
  const { screenshot, screenshotWithLocatorHighlight } = helper;
  const electionPackage = await mockElectionPackageFileTree({
    electionDefinition,
    systemSettings: {
      ...DEFAULT_SYSTEM_SETTINGS,
      disableVoterHelpButtons: true,
    },
    uiStrings: electionGeneralFixtures.uiStrings,
  });

  await page
    .getByText('Insert an election manager card to configure VxMark')
    .waitFor();
  await configureMachine(page, {
    election,
    electionPackage,
    pollingPlaceName,
  });

  // Open polls and start a voting session.
  mockCardRemoval();
  await page.getByText(/poll worker card/).waitFor();
  await openPolls(page, election);
  await page.getByRole('button', { name: /Start Voting Session/ }).click();
  await page.getByText('Remove Card to Begin Voting Session').waitFor();
  mockCardRemoval();
  await page.getByRole('button', { name: 'Start Voting' }).click();

  // Voter is on the first contest; the language and settings menu buttons are
  // always present on voter screens.
  await page.getByRole('button', { name: 'Settings' }).waitFor();

  // Highlight the language + settings menu buttons together.
  await screenshotWithLocatorHighlight(
    page.getByRole('button', { name: 'Settings' }).locator('..'),
    'voting-language-and-settings-highlighted'
  );

  // Language settings screen.
  await page.getByRole('button', { name: /English/ }).click();
  await page
    .getByRole('heading', { name: 'Select Your Ballot Language' })
    .waitFor();
  await screenshot('voting-language-settings');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Settings' }).waitFor();

  // Voter settings — color. Select each contrast option by its visible label.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Color' }).waitFor();
  const colorSettingLabels = [
    'White text, black background',
    'Gray text, dark background',
    'Dark text, light background',
    'Black text, white background',
  ];
  for (const [i, label] of colorSettingLabels.entries()) {
    await page.getByText(label, { exact: true }).click();
    await screenshot(`voting-settings-color-${i + 1}`);
  }
  // Reset to the default color so later screenshots aren't affected.
  await page.getByRole('button', { name: 'Reset', exact: true }).click();

  // Voter settings — text size. Select each size option by its visible label.
  await page.getByRole('tab', { name: 'Text Size' }).click();
  await page.getByRole('tab', { name: 'Text Size', selected: true }).waitFor();
  const textSizeLabels = ['Small', 'Medium', 'Large', 'Extra-Large'];
  for (const [i, label] of textSizeLabels.entries()) {
    await page.getByText(label, { exact: true }).click();
    await screenshot(`voting-settings-text-size-${i + 1}`);
  }
  // Reset to the default text size so later screenshots aren't affected.
  await page.getByRole('button', { name: 'Reset', exact: true }).click();

  // Voter settings — audio.
  await page.getByRole('tab', { name: 'Audio' }).click();
  await page.getByRole('tab', { name: 'Audio', selected: true }).waitFor();
  await screenshot('voting-settings-audio');

  // Audio-only mode. Enabling it closes the settings and shows a full-screen
  // overlay; exit it afterward so later screenshots aren't affected. The
  // overlay is aria-hidden, so locate the exit button by its text.
  await page.getByRole('button', { name: 'Enable Audio-Only Mode' }).click();
  await page.getByText('Exit Audio-Only Mode').waitFor();
  await screenshot('voting-settings-audio-only-mode');
  await page.getByText('Exit Audio-Only Mode').click();

  // Settings were closed by entering audio-only mode; wait for the voter screen.
  await page.getByRole('button', { name: 'Settings' }).waitFor();

  // PAT calibration tutorial — triggered by a PAT key press from the (light)
  // contest screen, navigated with the "1" (Move) and "2" (Select) keys.
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
  await page.getByRole('heading', { name: 'Device Inputs Chosen' }).waitFor();
  await screenshot('pat-device-identified');

  // Exit the PAT tutorial to return to the contest screen.
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Settings' }).waitFor();

  // Multilingual ballot: switch the ballot language to Chinese now (before
  // voting), so the language is settled by the time the ballot is printed. The
  // language controls and subsequent navigation use stable element ids
  // (#zh-Hans-label, #next, #next_after_confirm) so the translated button text
  // doesn't matter.
  await page.getByRole('button', { name: /English/ }).click();
  await page
    .getByRole('heading', { name: 'Select Your Ballot Language' })
    .waitFor();
  await page.locator('#zh-Hans-label').click();
  await page.locator('#next').click(); // Done (now rendered in Chinese)
  // Wait for the language change to propagate before continuing.
  await expect(page.getByRole('button', { name: /English/ })).toHaveCount(0);

  // Vote a full ballot so the printed ballot has real selections, then print
  // and capture the dual-language (English + Chinese) ballot. Wait for a new
  // print to land (an English ballot may have been printed earlier).
  await voteFullBallot(page, { election, pollingPlaceName });
  const previousPrintPath = getMockFilePrinterHandler().getLastPrintPath();
  await page.locator('#next_after_confirm').click(); // Print My Ballot
  await expect
    .poll(() => getMockFilePrinterHandler().getLastPrintPath(), {
      timeout: 15000,
    })
    .not.toBe(previousPrintPath);
  await capturePrintedBallot('printed-ballot-multilingual', screenshotCounter);
});
