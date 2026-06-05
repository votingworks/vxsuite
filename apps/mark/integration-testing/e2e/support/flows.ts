import { Page } from '@playwright/test';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import { assert, assertDefined, find } from '@votingworks/basics';
import { Election, getContests, hasSplits } from '@votingworks/types';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import { getBallotStyleGroupsForPrecinctOrSplit } from '@votingworks/utils';
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
 * Returns the contests for a voter session at the given polling place,
 * mirroring how the poll worker screen picks the session's ballot style: the
 * default-language ballot style of the single ballot style group for the
 * polling place's precinct (see BallotStyleSelect in libs/mark-flow-ui).
 */
function getVoterSessionContests(election: Election, pollingPlaceName: string) {
  const pollingPlace = find(
    assertDefined(election.pollingPlaces),
    (p) => p.name === pollingPlaceName
  );
  const precinct = find(election.precincts, (p) =>
    Object.hasOwn(pollingPlace.precincts, p.id)
  );
  assert(!hasSplits(precinct));
  const [ballotStyleGroup] = getBallotStyleGroupsForPrecinctOrSplit({
    election,
    precinctOrSplit: { precinct },
  });
  return getContests({
    election,
    ballotStyle: assertDefined(ballotStyleGroup).defaultLanguageBallotStyle,
  });
}

/**
 * Votes a selection in every contest and advances to the review screen.
 * Selects the first available option in each contest (the first candidate or
 * the "Yes" option), so the printed ballot has real votes. Assumes the voter is
 * on the first contest screen. Uses language-independent locators (the option
 * role, the "Next" button id, and the review screen's print button id) so it
 * works regardless of the ballot language. Visits exactly one screen per
 * contest on the session's ballot style (language variants share contests), so
 * the flow fails fast if a screen doesn't advance as expected.
 */
export async function voteFullBallot(
  page: Page,
  options: { election: Election; pollingPlaceName: string }
): Promise<void> {
  const { election, pollingPlaceName } = options;
  const contests = getVoterSessionContests(election, pollingPlaceName);
  for (let i = 0; i < contests.length; i += 1) {
    await page.getByRole('option').first().click();
    await page.locator('#next').click();
  }
  // The print button only appears on the review screen, marking the end.
  await page.locator('#next_after_confirm').waitFor();
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
