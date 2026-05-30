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
