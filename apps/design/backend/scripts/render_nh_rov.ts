import {
  convertPdfToSpotColor,
  createPlaywrightRendererPool,
  renderNhRovForm,
  spotColorForParty,
  Renderer,
} from '@votingworks/hmpb';
import { assertDefined } from '@votingworks/basics';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { convertNhElection, NhBallotStyleSchema } from './convert_nh_election';
import {
  discoverBallotStyleFiles,
  groupByTown,
  resolveLatestVersions,
  TownGroup,
} from './nh_delivery';
import { deliverableRovPath } from './nh_deliverable_layout';
import { readNhBallotStyleFile } from './nh_xml';

function sanitize(name: string): string {
  return name.replace(/[^\w -]/g, '').trim();
}

interface TownResult {
  townName: string;
  rovCount: number;
}

// Renders a Return of Votes form per ballot style (town/ward x party) into the
// deliverable rov/ tree. ROV forms carry no watermark and use their own fixed
// (Legal) layout, so this needs neither the proof/final distinction nor the
// paper-size auto-fit that ballot rendering requires -- just the converted
// election. Each form is spot-converted for printing (party tint on its spot
// plate, the form's gray shading on black), matching the ballot deliverable.
async function renderTownRovs(
  renderer: Renderer,
  town: TownGroup,
  outDir: string
): Promise<TownResult> {
  const nhBallotStyles = town.files.map((file) =>
    NhBallotStyleSchema.parse(readNhBallotStyleFile(file.path))
  );
  const election = convertNhElection(nhBallotStyles);
  const townName = election.jurisdiction.name;

  for (const ballotStyle of election.ballotStyles) {
    const party = election.parties.find((p) => p.id === ballotStyle.partyId);
    const partyAbbrev = party ? party.abbrev : 'NONPARTISAN';
    const precinct = assertDefined(
      election.precincts.find((p) => p.id === ballotStyle.precincts[0])
    );
    // Leaf granularity is per town/ward: unwarded towns use the town name; a
    // warded town adds the ward name to disambiguate its ballot styles.
    const ward = precinct.name === townName ? '' : ` ${precinct.name}`;
    const townWard = sanitize(`${townName}${ward}`);

    const rovDocument = await renderNhRovForm(renderer, {
      election,
      ballotStyle,
    });
    const rovPdf = await rovDocument.renderToPdf();
    const spot = party && spotColorForParty(party);
    const relPath = deliverableRovPath(partyAbbrev, townWard);
    await mkdir(join(outDir, dirname(relPath)), { recursive: true });
    await writeFile(
      join(outDir, relPath),
      spot ? await convertPdfToSpotColor(rovPdf, spot) : rovPdf
    );
  }

  return { townName, rovCount: election.ballotStyles.length };
}

const USAGE = `Usage: render_nh_rov <delivery-dir> <out-dir> [town-name-filter]

Renders Return of Votes forms only (no ballots, no election packages) for every
town in the delivery, one per town/ward x party, into <out-dir>/rov/<party>/.
Reads either JSON or the equivalent AVSInterface XML ballot-style exports.`;

export async function main(args: readonly string[]): Promise<number> {
  if (args.length < 2) {
    console.error(USAGE);
    return 1;
  }
  const [deliveryDir, outDir, filter] = args;
  await mkdir(outDir, { recursive: true });

  const { resolved } = resolveLatestVersions(
    discoverBallotStyleFiles(deliveryDir)
  );
  let towns = groupByTown(resolved);
  if (filter) {
    towns = towns.filter((t) =>
      t.townName.toLowerCase().includes(filter.toLowerCase())
    );
  }
  if (towns.length === 0) {
    console.error(`No towns match filter "${filter}"`);
    return 1;
  }
  console.log(`Rendering ROV forms for ${towns.length} town(s) -> ${outDir}\n`);

  const pool = await createPlaywrightRendererPool();
  let results: TownResult[];
  try {
    results = await pool.runTasks(
      towns.map(
        (town) => (renderer: Renderer) => renderTownRovs(renderer, town, outDir)
      ),
      (done, total) => {
        if (done === total || done % 10 === 0) {
          console.log(`  rendered ${done}/${total} towns`);
        }
      }
    );
  } finally {
    await pool.close();
  }

  const totalRovs = results.reduce((sum, r) => sum + r.rovCount, 0);
  for (const result of results) {
    console.log(`${result.townName}: ${result.rovCount} ROV form(s)`);
  }
  console.log(
    `\nDone. ${totalRovs} ROV form(s) across ${results.length} town(s).`
  );
  return 0;
}

/* istanbul ignore next */
if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
