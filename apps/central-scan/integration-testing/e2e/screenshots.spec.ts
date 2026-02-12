import { resolve } from 'node:path';
import test from '@playwright/test';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import {
  clearTemporaryRootDir,
  electionFamousNames2021Fixtures,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import * as grout from '@votingworks/grout';
import type { Api as DevDockApi } from '@votingworks/dev-dock-backend';
import { buildIntegrationTestHelper } from '@votingworks/test-utils';
import {
  forceLogOutAndResetElectionDefinition,
  logInAsElectionManager,
} from './support/auth';

const MARKED_BALLOT_PATH = resolve(
  __dirname,
  '../../../../libs/hmpb/fixtures/vx-famous-names/marked-official-ballot.pdf'
);

test.beforeAll(setupTemporaryRootDir);
test.afterAll(clearTemporaryRootDir);

test.beforeEach(async ({ page }) => {
  await forceLogOutAndResetElectionDefinition(page);
  getMockFileUsbDriveHandler().cleanup();
});

test('screenshots', async ({ page }) => {
  const fixtureSet = electionFamousNames2021Fixtures;
  const usbHandler = getMockFileUsbDriveHandler();
  const {
    screenshot,
    screenshotWithFocusHighlight,
    withContainerVerticallyExpanded,
  } = buildIntegrationTestHelper(page);

  await page.getByText(/election manager card to configure/).waitFor();
  await screenshot('em-insert-card-screen');

  await logInAsElectionManager(page, fixtureSet.readElection());
  await page.getByText(/a USB drive/).waitFor();
  await screenshot('em-insert-usb');

  usbHandler.insert(
    await mockElectionPackageFileTree(
      electionFamousNames2021Fixtures.electionJson.toElectionPackage()
    )
  );
  await page.getByText(/Configuring/).waitFor();
  await screenshot('em-configuring');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByText('Official Ballot Mode').click();
  await screenshot('em-settings');

  await screenshotWithFocusHighlight(
    'Unconfigure Machine',
    'em-settings-unconfigure-machine-button'
  );
  await page.getByRole('button', { name: 'Unconfigure Machine' }).click();
  await screenshotWithFocusHighlight(
    'Delete All Election Data',
    'em-settings-confirm-unconfigure-button'
  );
  await page.getByText('Cancel').click();

  await screenshotWithFocusHighlight(
    'Save Logs',
    'em-settings-save-logs-button'
  );

  await page.getByText('Diagnostics').click();
  await screenshot('em-partial-diagnostics-screen');

  await withContainerVerticallyExpanded('main', async () => {
    await screenshot('em-full-diagnostics-screen');
  });

  await page.getByText('Scan Ballots').click();
  await page.getByText('No ballots have been scanned').waitFor();
  await screenshot('em-scan-ballots-empty');

  // Load ballot images into the mock batch scanner via the dev dock API
  const devDockClient = grout.createClient<DevDockApi>({
    baseUrl: 'http://127.0.0.1:3001/dock',
  });
  await devDockClient.batchScannerLoadBallots({
    paths: [MARKED_BALLOT_PATH],
  });

  await page.getByText('Scan New Batch').click();
  await page.getByText('Total Sheets: 1').waitFor();
  await screenshot('em-scan-ballots-with-batch');
  await screenshotWithFocusHighlight(
    'Save CVRs',
    'em-scan-ballots-save-cvrs-button'
  );

  usbHandler.cleanup();
});
