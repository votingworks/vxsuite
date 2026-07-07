import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Page } from '@playwright/test';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import {
  BallotType,
  ElectionDefinition,
  EncodedBallotEntry,
} from '@votingworks/types';
import { getMockUsbDriveHandler } from '@votingworks/usb-drive';
import { logInAsElectionManager } from './auth';

type ElectionPackageFileTree = Awaited<
  ReturnType<typeof mockElectionPackageFileTree>
>;

// The famous-names ballot PDFs, reused for every ballot style regardless of the
// election. VxPrint configuration only requires that an encoded ballot exists
// for each style; it does not validate that the PDF matches the style. Reusing
// these fixtures avoids generating custom ballot PDFs per election.
async function getFamousNamesBallotPdfBase64s(): Promise<
  readonly [string, string, string, string]
> {
  const baseDir = resolve(
    __dirname,
    '../../../../../libs/hmpb/fixtures/vx-famous-names'
  );
  const [pdf1, pdf2, pdf3, pdf4] = await Promise.all([
    readFile(join(baseDir, 'blank-ballot.pdf')),
    readFile(join(baseDir, 'marked-ballot.pdf')),
    readFile(join(baseDir, 'blank-official-ballot.pdf')),
    readFile(join(baseDir, 'marked-official-ballot.pdf')),
  ]);
  return [
    pdf1.toString('base64'),
    pdf2.toString('base64'),
    pdf3.toString('base64'),
    pdf4.toString('base64'),
  ] as const;
}

/**
 * Builds encoded ballots for every ballot style in the election, in both
 * precinct and absentee variants for each requested ballot mode. Mirrors the
 * VxPrint backend test helper of the same name.
 */
export async function buildBallotsForElection({
  electionDefinition,
  ballotModes,
}: {
  electionDefinition: ElectionDefinition;
  ballotModes: ReadonlyArray<'official' | 'test'>;
}): Promise<EncodedBallotEntry[]> {
  const { ballotStyles } = electionDefinition.election;
  const pdfBase64s = await getFamousNamesBallotPdfBase64s();

  const ballots: EncodedBallotEntry[] = [];
  for (const [index, ballotStyle] of ballotStyles.entries()) {
    const precinctId = ballotStyle.precincts[0];
    if (!precinctId) {
      throw new Error(`Ballot style ${ballotStyle.id} has no precincts`);
    }
    const encodedBallot = pdfBase64s[index % pdfBase64s.length];
    for (const ballotMode of ballotModes) {
      ballots.push(
        {
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType: BallotType.Precinct,
          ballotMode,
          encodedBallot,
        },
        {
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType: BallotType.Absentee,
          ballotMode,
          encodedBallot,
        }
      );
    }
  }

  return ballots;
}

/**
 * Configures the machine from the unconfigured state: logs in as election
 * manager, inserts a USB drive containing the given election package (which
 * auto-configures the machine), and selects the given polling place on the
 * Election screen. Leaves the election manager logged in on the Election screen.
 */
export async function configureMachine(
  page: Page,
  options: {
    election: ElectionDefinition['election'];
    electionPackage: ElectionPackageFileTree;
    pollingPlaceName: string;
  }
): Promise<void> {
  const { election, electionPackage, pollingPlaceName } = options;
  const usbHandler = getMockUsbDriveHandler();

  await logInAsElectionManager(page, election);
  await page
    .getByText('Insert a USB drive containing an election package')
    .waitFor();

  usbHandler.insert(electionPackage);

  // Auto-configures on USB mount. The app stays on whatever route was last
  // active, so navigate to the Election screen to select a polling place.
  await page.getByRole('button', { name: 'Election', exact: true }).click();
  await page.getByLabel(/select a polling place/i).waitFor();
  await page.getByLabel(/select a polling place/i).click({ force: true });
  await page.getByText(pollingPlaceName, { exact: true }).click();
}
