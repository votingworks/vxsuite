import { Page, expect } from '@playwright/test';
import { mockCardRemoval } from '@votingworks/auth';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { Election } from '@votingworks/types';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import { logInAsElectionManager, logInAsPollWorker } from './auth';

async function postToApi(page: Page, method: string, input: object = {}) {
  return page.request.post(`/api/${method}`, {
    data: JSON.stringify(input),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Simulates a voter inserting a blank ballot sheet to start a voting session.
 * VxMarkScan's mock paper handler does not physically feed paper. The frontend
 * has a dev-only auto-insert effect, but it fires unreliably under test, so we
 * drive the mock directly: once the session has begun, if the machine is still
 * waiting for a sheet, mark one as inserted so the state machine loads it. If
 * the auto-insert effect already advanced the flow, this is a no-op.
 */
export async function insertBlankBallotSheet(page: Page): Promise<void> {
  await expect
    .poll(async () => (await postToApi(page, 'getPaperHandlerState')).text(), {
      timeout: 10_000,
    })
    .not.toContain('not_accepting_paper');
  const state = await (await postToApi(page, 'getPaperHandlerState')).text();
  if (state.includes('accepting_paper')) {
    await postToApi(page, 'setMockPaperHandlerStatus', {
      mockStatus: 'paperInserted',
    });
  }
}

type ElectionPackageFileTree = Awaited<
  ReturnType<typeof mockElectionPackageFileTree>
>;

/**
 * Configures the machine from the unconfigured state: logs in as election
 * manager, inserts a USB drive containing the given election package, selects
 * the given polling place, and switches to official ballot mode. Leaves the
 * election manager card inserted.
 */
export async function configureMachine(
  page: Page,
  options: {
    election: Election;
    electionPackage: ElectionPackageFileTree;
    pollingPlaceName: string;
  }
): Promise<void> {
  const { election, electionPackage, pollingPlaceName } = options;
  const usbHandler = getMockFileUsbDriveHandler();

  await logInAsElectionManager(page, election);
  await page.getByText(/USB drive/).waitFor();

  usbHandler.insert(electionPackage);
  await page.getByText('Election Manager Menu').waitFor();

  await page.getByText(/select a polling place/i).click({ force: true });
  await page.getByText(pollingPlaceName, { exact: true }).click();

  await page.getByRole('option', { name: 'Official Ballot Mode' }).click();
  await page
    .getByRole('option', { name: 'Official Ballot Mode', selected: true })
    .waitFor();
}

/**
 * Opens the polls as a poll worker, then leaves the card inserted. Assumes the
 * machine is configured and showing the unauthenticated "insert poll worker
 * card to open polls" screen.
 */
export async function openPolls(page: Page, election: Election): Promise<void> {
  logInAsPollWorker(election);
  await page.getByText('Poll Worker Menu').waitFor();
  await page.getByText('Open Polls').click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Open Polls' })
    .click();
  // Wait for the confirmation modal to fully close before returning, so a
  // following click (e.g. "Start Voting Session") isn't swallowed by the
  // closing dialog.
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  await page.getByText('Close Polls').waitFor();
}

/**
 * Starts a voter session as a poll worker and drives the paper-handler load
 * sequence (unique to VxMarkScan: the voter's blank ballot sheet is loaded into
 * the printer-scanner before voting begins). The mock paper handler advances the
 * mechanical states automatically, so no paper status needs to be set. Removes
 * the poll worker card and leaves the voter on the "Start Voting" screen.
 */
export async function startVotingSession(page: Page): Promise<void> {
  const startButton = page.getByRole('button', {
    name: /Start Voting Session/,
  });
  await startButton.waitFor();
  await startButton.click();
  await insertBlankBallotSheet(page);
  await page.getByText(/Remove Card/).waitFor();
  mockCardRemoval();
  await page.getByRole('button', { name: 'Start Voting' }).waitFor();
}
