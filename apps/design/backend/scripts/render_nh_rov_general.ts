import {
  createPlaywrightRendererPool,
  renderNhRovForm,
  Renderer,
} from '@votingworks/hmpb';
import { assertDefined } from '@votingworks/basics';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { convertNhElection, NhBallotStyleSchema } from './convert_nh_election';
import {
  addBallotQuestions,
  discoverGeneralTowns,
} from './nh_general_paper_sizes';

function sanitize(name: string): string {
  return name.replace(/[^\w -]/g, '').trim();
}

interface TownResult {
  townName: string;
  rovCount: number;
  failures: string[];
}

// Renders a general election Return of Votes form per ballot style (one per
// town/ward; general ballot styles are nonpartisan). Fit failures
// (assertContestsFit) are collected per ballot style rather than aborting the
// batch, so one run reports every town that needs attention.
async function renderTownRovs(
  renderer: Renderer,
  town: { townName: string; paths: string[] },
  outDir: string
): Promise<TownResult> {
  const nhBallotStyles = town.paths.map((path) =>
    NhBallotStyleSchema.parse(JSON.parse(readFileSync(path, 'utf-8')))
  );
  const election = addBallotQuestions(convertNhElection(nhBallotStyles));
  const townName = election.jurisdiction.name;
  const failures: string[] = [];

  let rovCount = 0;
  for (const ballotStyle of election.ballotStyles) {
    const precinct = assertDefined(
      election.precincts.find((p) => p.id === ballotStyle.precincts[0])
    );
    const ward = precinct.name === townName ? '' : ` ${precinct.name}`;
    const townWard = sanitize(`${townName}${ward}`);
    try {
      const rovDocument = await renderNhRovForm(renderer, {
        election,
        ballotStyle,
      });
      await writeFile(
        join(outDir, `${townWard} - ROV.pdf`),
        await rovDocument.renderToPdf()
      );
      rovCount += 1;
    } catch (error) {
      failures.push(`${townWard}: ${(error as Error).message}`);
    }
  }

  return { townName, rovCount, failures };
}

const USAGE = `Usage: render_nh_rov_general <general-json-dir> <out-dir> [town-name-filter]

Renders general election Return of Votes forms for every town in a general
election export dir (<TOWN>_V<n>_<id>.json files), one per town/ward, into
<out-dir>. Doubles as the fit check: any form whose tally overflows the page
is reported at the end instead of failing the whole batch.`;

export async function main(args: readonly string[]): Promise<number> {
  if (args.length < 2) {
    console.error(USAGE);
    return 1;
  }
  const [generalDir, outDir, filter] = args;
  await mkdir(outDir, { recursive: true });

  let towns = discoverGeneralTowns(generalDir);
  if (filter) {
    towns = towns.filter((t) =>
      t.townName.toLowerCase().includes(filter.toLowerCase())
    );
  }
  if (towns.length === 0) {
    console.error(`No towns match filter "${filter}"`);
    return 1;
  }
  console.log(
    `Rendering general ROV forms for ${towns.length} town(s) -> ${outDir}\n`
  );

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
  const failures = results.flatMap((r) => r.failures);
  console.log(
    `\nDone. ${totalRovs} ROV form(s) across ${results.length} town(s).`
  );
  if (failures.length > 0) {
    console.error(`\n${failures.length} form(s) FAILED to fit:`);
    for (const failure of failures) {
      console.error(`  ${failure}`);
    }
    return 1;
  }
  return 0;
}

/* istanbul ignore next */
if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
