import { test } from '@playwright/test';
import {
  clearTemporaryRootDir,
  electionFamousNames2021Fixtures,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import {
  mockCardRemoval,
  mockPollWorkerCardInsertion,
} from '@votingworks/auth';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { buildIntegrationTestHelper } from '@votingworks/test-utils';
import {
  logInAsElectionManager,
  logInAsSystemAdministrator,
} from '../support/auth';

test.beforeAll(setupTemporaryRootDir);
test.afterAll(clearTemporaryRootDir);

test.beforeEach(async ({ page }) => {
  getMockFileUsbDriveHandler().cleanup();
  await page.clock.install();
});

test('screenshots', async ({ page }) => {
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

  // navigate back to diagnostics
  await page.getByText('Diagnostics').click();

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

  // TODO: voting session, needs a multi-lang fixture. for now, just bail
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
});
