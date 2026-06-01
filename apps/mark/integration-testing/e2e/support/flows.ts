import { Page } from '@playwright/test';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { Election } from '@votingworks/types';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import { logInAsElectionManager, logInAsPollWorker } from './auth';

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

  await page.getByLabel(/select a polling place/i).click({ force: true });
  await page.getByText(pollingPlaceName, { exact: true }).click();

  await page.getByRole('option', { name: 'Official Ballot Mode' }).click();
  await page
    .getByRole('option', { name: 'Official Ballot Mode', selected: true })
    .waitFor();
}

/**
 * Votes a selection in every contest and advances to the review screen.
 * Selects the first available option in each contest (the first candidate or
 * the "Yes" option), so the printed ballot has real votes. Assumes the voter is
 * on the first contest screen. Uses language-independent locators (the "Next"
 * button id and the review screen's print button id) so it works regardless of
 * the ballot language.
 */
export async function voteFullBallot(page: Page): Promise<void> {
  // The print button only appears on the review screen, marking the end.
  const printButton = page.locator('#next_after_confirm');
  for (let guard = 0; guard < 40; guard += 1) {
    if (await printButton.isVisible()) return;
    const firstOption = page.getByRole('option').first();
    if (await firstOption.isVisible()) {
      await firstOption.click();
    }
    await page.locator('#next').click();
  }
  await printButton.waitFor();
}

/**
 * Opens the polls as a poll worker, then removes the card. Assumes the machine
 * is configured and showing the unauthenticated "insert poll worker card to
 * open polls" screen.
 */
export async function openPolls(page: Page, election: Election): Promise<void> {
  logInAsPollWorker(election);
  await page.getByText('Poll Worker Menu').waitFor();
  await page.getByRole('button', { name: 'Open Polls' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Open Polls' })
    .click();
  await page.getByRole('button', { name: 'Close Polls' }).waitFor();
}
