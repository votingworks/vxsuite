import { BallotType, safeParse } from '@votingworks/types';
import {
  ballotTemplates,
  createPlaywrightRenderer,
  renderBallotPreviewToPdf,
  renderNhRovForm,
} from '@votingworks/hmpb';
import { assertDefined } from '@votingworks/basics';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { convertNhElection, NhBallotStyleSchema } from './convert_nh_election';
import { readNhBallotStyleFile } from './nh_xml';

const USAGE = `Usage: render_nh_proofs <out-dir> <nh-ballot-style.json>...

All provided JSON files are treated as ONE town's ballot styles (all wards
across both parties) and converted into a single election. One ballot proof is
rendered per ballot style, plus one Return of Votes form per party.`;

function sanitize(name: string): string {
  return name.replace(/[^\w -]/g, '').trim();
}

export async function main(args: readonly string[]): Promise<number> {
  if (args.length < 2) {
    console.error(USAGE);
    return 1;
  }
  const [outDir, ...stylePaths] = args;
  await mkdir(outDir, { recursive: true });

  const nhBallotStyles = stylePaths.map((stylePath) =>
    safeParse(
      NhBallotStyleSchema,
      readNhBallotStyleFile(stylePath)
    ).unsafeUnwrap()
  );
  const election = convertNhElection(nhBallotStyles);
  const townName = election.jurisdiction.name;

  const renderer = await createPlaywrightRenderer();
  try {
    for (const ballotStyle of election.ballotStyles) {
      const precinct = assertDefined(
        election.precincts.find((p) => p.id === ballotStyle.precincts[0])
      );
      const party = election.parties.find((p) => p.id === ballotStyle.partyId);
      const ward = precinct.name === townName ? '' : ` ${precinct.name}`;
      const label = sanitize(`${townName}${ward} ${party ? party.name : ''}`);

      const ballotPdf = (
        await renderBallotPreviewToPdf(
          renderer,
          ballotTemplates.NhStateBallot,
          {
            election,
            ballotMode: 'official',
            ballotType: BallotType.Precinct,
            ballotStyleId: ballotStyle.id,
            precinctId: ballotStyle.precincts[0],
            watermark: 'PROOF',
          }
        )
      ).unsafeUnwrap();
      const ballotPath = join(outDir, `${label} - ballot.pdf`);
      await writeFile(ballotPath, ballotPdf);
      console.log(`Wrote ${ballotPath}`);

      const rovDocument = await renderNhRovForm(renderer, {
        election,
        ballotStyle,
      });
      const rovPath = join(outDir, `${label} - ROV.pdf`);
      await writeFile(rovPath, await rovDocument.renderToPdf());
      console.log(`Wrote ${rovPath}`);
    }
  } finally {
    await renderer.close();
  }
  return 0;
}

/* istanbul ignore next */
if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
