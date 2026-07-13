import {
  BallotType,
  Election,
  getContests,
  HmpbBallotPaperSize,
} from '@votingworks/types';
import {
  ballotTemplates,
  createPlaywrightRendererPool,
  RenderDocument,
  Renderer,
  renderBallotTemplate,
  renderNhRovForm,
} from '@votingworks/hmpb';
import { assertDefined } from '@votingworks/basics';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { convertNhElection, NhBallotStyleSchema } from './convert_nh_election';
import {
  discoverBallotStyleFiles,
  groupByTown,
  resolveLatestVersions,
  TownGroup,
} from './nh_delivery';

// Paper sizes tried in ascending height order for auto-fit. NH ballots are
// single-sided, so a size "fits" when no contests spill onto the back page.
const SIZE_ORDER: HmpbBallotPaperSize[] = [
  HmpbBallotPaperSize.Letter,
  HmpbBallotPaperSize.Legal,
  HmpbBallotPaperSize.Custom17,
  HmpbBallotPaperSize.Custom18,
  HmpbBallotPaperSize.Custom19,
  HmpbBallotPaperSize.Custom20,
  HmpbBallotPaperSize.Custom22,
];

function sanitize(name: string): string {
  return name.replace(/[^\w -]/g, '').trim();
}

interface BallotVariant {
  suffix: string;
  ballotMode: 'official' | 'sample';
  ballotType: BallotType;
  isFederalOfficeOnly: boolean;
}

// The variants produced for every ballot style, matching what NH expects:
// the regular precinct ballot, an absentee ballot, a federal-office-only
// (overseas/military) ballot, and a sample ballot.
const BALLOT_VARIANTS: BallotVariant[] = [
  {
    suffix: 'precinct',
    ballotMode: 'official',
    ballotType: BallotType.Precinct,
    isFederalOfficeOnly: false,
  },
  {
    suffix: 'absentee',
    ballotMode: 'official',
    ballotType: BallotType.Absentee,
    isFederalOfficeOnly: false,
  },
  {
    suffix: 'federal-office-only',
    ballotMode: 'official',
    ballotType: BallotType.Absentee,
    isFederalOfficeOnly: true,
  },
  {
    suffix: 'sample',
    ballotMode: 'sample',
    ballotType: BallotType.Precinct,
    isFederalOfficeOnly: false,
  },
];

// The precinct variant carries the full contest list, so it drives auto-fit.
const PRECINCT_VARIANT = BALLOT_VARIANTS[0];

// A voting bubble on the back page means a contest overflowed off the front;
// NH ballots are single-sided, so that indicates the paper size is too small.
const BACK_PAGE_BUBBLE_SELECTOR = '.page[data-page-number="2"] .bubble';

async function documentOverflowsToBack(
  document: RenderDocument
): Promise<boolean> {
  const backBubbles = await document.inspectElements(BACK_PAGE_BUBBLE_SELECTOR);
  return backBubbles.length > 0;
}

function ballotStyleProps(
  election: Election,
  ballotStyleId: string,
  isHandCount: boolean,
  variant: BallotVariant
) {
  const ballotStyle = assertDefined(
    election.ballotStyles.find((b) => b.id === ballotStyleId)
  );
  return {
    election,
    ballotMode: variant.ballotMode,
    ballotType: variant.ballotType,
    ballotStyleId,
    precinctId: ballotStyle.precincts[0],
    watermark: 'PROOF' as const,
    isHandCount,
    isFederalOfficeOnly: variant.isFederalOfficeOnly,
  };
}

// The ballot style most likely to overflow: most option rows (candidates plus
// write-in lines). Used as the probe for auto-fit.
function largestBallotStyleId(election: Election): string {
  let bestId = election.ballotStyles[0].id;
  let bestRows = -1;
  for (const ballotStyle of election.ballotStyles) {
    const contests = getContests({ election, ballotStyle });
    const rows = contests.reduce(
      (sum, contest) =>
        sum +
        (contest.type === 'candidate'
          ? contest.candidates.length + contest.seats
          : 0),
      0
    );
    if (rows > bestRows) {
      bestRows = rows;
      bestId = ballotStyle.id;
    }
  }
  return bestId;
}

async function overflowsToBack(
  renderer: Renderer,
  election: Election,
  ballotStyleId: string,
  isHandCount: boolean
): Promise<boolean> {
  const document = (
    await renderBallotTemplate(
      renderer,
      ballotTemplates.NhStateBallot,
      ballotStyleProps(election, ballotStyleId, isHandCount, PRECINCT_VARIANT)
    )
  ).unsafeUnwrap();
  return documentOverflowsToBack(document);
}

interface FitResult {
  paperSize: HmpbBallotPaperSize;
  overflowedAtMax: boolean;
}

// Pick the smallest paper size on which the town's largest ballot style keeps
// all contests off the back page.
export async function autoFitPaperSize(
  renderer: Renderer,
  election: Election,
  isHandCount: boolean
): Promise<FitResult> {
  const probeId = largestBallotStyleId(election);
  for (const paperSize of SIZE_ORDER) {
    const sized: Election = {
      ...election,
      ballotLayout: { ...election.ballotLayout, paperSize },
    };
    if (!(await overflowsToBack(renderer, sized, probeId, isHandCount))) {
      return { paperSize, overflowedAtMax: false };
    }
  }
  return {
    paperSize: SIZE_ORDER[SIZE_ORDER.length - 1],
    overflowedAtMax: true,
  };
}

interface TownResult {
  townName: string;
  variant: string;
  paperSize: HmpbBallotPaperSize;
  overflowedAtMax: boolean;
  ballotCount: number;
  // Rendered ballots (label + variant) whose contests still spilled onto the
  // back at the chosen size -- a check that every ballot fits, not just the
  // auto-fit probe.
  overflows: string[];
}

async function renderTown(
  renderer: Renderer,
  town: TownGroup,
  outDir: string
): Promise<TownResult> {
  const nhBallotStyles = town.files.map((file) =>
    NhBallotStyleSchema.parse(JSON.parse(readFileSync(file.path, 'utf-8')))
  );
  const isHandCount = town.variant === 'HandCount';
  const baseElection = convertNhElection(nhBallotStyles);
  const { paperSize, overflowedAtMax } = await autoFitPaperSize(
    renderer,
    baseElection,
    isHandCount
  );
  const election: Election = {
    ...baseElection,
    ballotLayout: { ...baseElection.ballotLayout, paperSize },
  };
  const townName = election.jurisdiction.name;
  const variantDir =
    town.variant === 'HandCount' ? 'Hand Count' : 'VotingWorks';
  const townDir = join(outDir, variantDir, sanitize(townName));
  await mkdir(townDir, { recursive: true });

  const overflows: string[] = [];
  for (const ballotStyle of election.ballotStyles) {
    const precinct = assertDefined(
      election.precincts.find((p) => p.id === ballotStyle.precincts[0])
    );
    const party = election.parties.find((p) => p.id === ballotStyle.partyId);
    const ward = precinct.name === townName ? '' : ` ${precinct.name}`;
    const label = sanitize(`${townName}${ward} ${party ? party.name : ''}`);
    for (const variant of BALLOT_VARIANTS) {
      const document = (
        await renderBallotTemplate(
          renderer,
          ballotTemplates.NhStateBallot,
          ballotStyleProps(election, ballotStyle.id, isHandCount, variant)
        )
      ).unsafeUnwrap();
      // Verify every rendered ballot fits, not just the auto-fit probe.
      if (await documentOverflowsToBack(document)) {
        overflows.push(`${label} - ${variant.suffix}`);
      }
      await writeFile(
        join(townDir, `${label} - ${variant.suffix}.pdf`),
        await document.renderToPdf()
      );
    }

    // Return of Votes form for this ward/party.
    const rovDocument = await renderNhRovForm(renderer, {
      election,
      ballotStyle,
    });
    await writeFile(
      join(townDir, `${label} - ROV.pdf`),
      await rovDocument.renderToPdf()
    );
  }

  return {
    townName,
    variant: town.variant,
    paperSize,
    overflowedAtMax,
    ballotCount: election.ballotStyles.length,
    overflows,
  };
}

const USAGE = `Usage: render_nh_batch <delivery-dir> <out-dir> [town-name-filter]`;

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
  console.log(`Rendering ${towns.length} town(s) -> ${outDir}\n`);

  // Render towns concurrently via a renderer pool (one reused page per task,
  // capped at the pool size), which is both fast and leak-free.
  const pool = await createPlaywrightRendererPool();
  let results: TownResult[];
  try {
    results = await pool.runTasks(
      towns.map(
        (town) => (renderer: Renderer) => renderTown(renderer, town, outDir)
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

  for (const result of results) {
    const flag =
      result.paperSize === HmpbBallotPaperSize.Letter
        ? ''
        : result.overflowedAtMax
        ? `  ⚠ STILL OVERFLOWS at ${result.paperSize}`
        : `  ← ${result.paperSize}`;
    console.log(
      `${result.townName} (${result.variant}): ${result.ballotCount} ballot styles x ${BALLOT_VARIANTS.length} variants${flag}`
    );
  }

  const nonLetter = results.filter(
    (r) => r.paperSize !== HmpbBallotPaperSize.Letter
  );
  const overflowed = results.filter((r) => r.overflowedAtMax);
  console.log(`\nDone. ${results.length} towns rendered.`);
  console.log(`Non-Letter paper size: ${nonLetter.length}`);
  for (const r of nonLetter) {
    console.log(`  ${r.townName}: ${r.paperSize}`);
  }
  if (overflowed.length > 0) {
    console.log(`Still overflow at largest size: ${overflowed.length}`);
    for (const r of overflowed) {
      console.log(`  ${r.townName}`);
    }
  }

  // Every rendered ballot is verified, not just the auto-fit probe. Any listed
  // here overflowed onto the back at its town's chosen size and needs a look.
  const overflowingBallots = results.flatMap((r) => r.overflows);
  if (overflowingBallots.length > 0) {
    console.log(
      `\n⚠ Ballots overflowing onto the back at the chosen size: ${overflowingBallots.length}`
    );
    for (const ballot of overflowingBallots) {
      console.log(`  ${ballot}`);
    }
  } else {
    console.log('\nAll rendered ballots fit on the front page.');
  }
  return 0;
}

/* istanbul ignore next */
if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
