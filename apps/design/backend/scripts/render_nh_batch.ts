import {
  BallotType,
  Election,
  getContests,
  HmpbBallotPaperSize,
} from '@votingworks/types';
import {
  ballotTemplates,
  convertPdfToSpotColor,
  createPlaywrightRendererPool,
  reducePdfToFirstPage,
  RenderDocument,
  Renderer,
  renderBallotTemplate,
  renderNhRovForm,
  spotColorForParty,
} from '@votingworks/hmpb';
import type { NhStateBallotProps } from '@votingworks/hmpb';
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
import {
  deliverableBallotPath,
  deliverableRovPath,
  deliverableType,
} from './nh_deliverable_layout';
import { readNhBallotStyleFile } from './nh_xml';

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
  ballotMode: 'official' | 'sample';
  ballotType: BallotType;
  isFederalOfficeOnly: boolean;
  isUocava: boolean;
  // Field-printed variants (UOCAVA + federal-office-only) go to voters who
  // often lack duplex printers, so they must be reduced to a single page. NH
  // auto-fits the paper size so all contests land on the front page, so dropping
  // the (blank) back page loses no votable content.
  singleSided: boolean;
}

// The variants produced for every ballot style, matching what NH expects:
// the regular precinct ballot, an absentee ballot, a federal-office-only
// (overseas/military) ballot, a UOCAVA (overseas/military) ballot, and a sample
// ballot. `deliverableType` maps each to its /[type]/ folder name.
const BALLOT_VARIANTS: BallotVariant[] = [
  {
    ballotMode: 'official',
    ballotType: BallotType.Precinct,
    isFederalOfficeOnly: false,
    isUocava: false,
    singleSided: false,
  },
  {
    ballotMode: 'official',
    ballotType: BallotType.Absentee,
    isFederalOfficeOnly: false,
    isUocava: false,
    singleSided: false,
  },
  {
    ballotMode: 'official',
    ballotType: BallotType.Absentee,
    isFederalOfficeOnly: true,
    isUocava: false,
    singleSided: true,
  },
  {
    // UOCAVA matches the absentee ballot's content but omits the
    // machine-scanning apparatus (timing marks + QR) and is a single page.
    ballotMode: 'official',
    ballotType: BallotType.Absentee,
    isFederalOfficeOnly: false,
    isUocava: true,
    singleSided: true,
  },
  {
    ballotMode: 'sample',
    ballotType: BallotType.Precinct,
    isFederalOfficeOnly: false,
    isUocava: false,
    singleSided: false,
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
): NhStateBallotProps {
  const ballotStyle = assertDefined(
    election.ballotStyles.find((b) => b.id === ballotStyleId)
  );
  return {
    election,
    ballotMode: variant.ballotMode,
    ballotType: variant.ballotType,
    ballotStyleId,
    precinctId: ballotStyle.precincts[0],
    // Proofs are always watermarked; the unwatermarked finals come from
    // render_nh_election_package.
    watermark: 'PROOF',
    isHandCount,
    isFederalOfficeOnly: variant.isFederalOfficeOnly,
    isUocava: variant.isUocava,
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
    NhBallotStyleSchema.parse(readNhBallotStyleFile(file.path))
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

  const overflows: string[] = [];
  for (const ballotStyle of election.ballotStyles) {
    const precinct = assertDefined(
      election.precincts.find((p) => p.id === ballotStyle.precincts[0])
    );
    const party = election.parties.find((p) => p.id === ballotStyle.partyId);
    const partyAbbrev = party ? party.abbrev : 'NONPARTISAN';
    // Leaf granularity is per town/ward: unwarded towns use the town name; a
    // warded town adds the ward name to disambiguate its ballot styles.
    const ward = precinct.name === townName ? '' : ` ${precinct.name}`;
    const townWard = sanitize(`${townName}${ward}`);
    // Print the ballot as two inks: the party's spot plate plus black.
    const spot = party && spotColorForParty(party);
    for (const variant of BALLOT_VARIANTS) {
      const document = (
        await renderBallotTemplate(
          renderer,
          ballotTemplates.NhStateBallot,
          ballotStyleProps(election, ballotStyle.id, isHandCount, variant)
        )
      ).unsafeUnwrap();
      // Verify every rendered ballot fits, not just the auto-fit probe. This
      // also guards the single-sided variants: an overflow means dropping the
      // back page would lose a contest.
      const type = deliverableType(variant);
      if (await documentOverflowsToBack(document)) {
        overflows.push(`${townWard} ${partyAbbrev} - ${type}`);
      }
      const fullPdf = await document.renderToPdf();
      const pdf = variant.singleSided
        ? await reducePdfToFirstPage(fullPdf)
        : fullPdf;
      const relPath = deliverableBallotPath(type, partyAbbrev, townWard);
      await mkdir(join(outDir, dirname(relPath)), { recursive: true });
      await writeFile(
        join(outDir, relPath),
        spot ? await convertPdfToSpotColor(pdf, spot) : pdf
      );
    }

    // Return of Votes form for this ward/party. Spot-converted like the
    // ballots: the party tint prints on its spot plate and the form's gray
    // shading stays on the black plate.
    const rovDocument = await renderNhRovForm(renderer, {
      election,
      ballotStyle,
    });
    const rovPdf = await rovDocument.renderToPdf();
    const rovRelPath = deliverableRovPath(partyAbbrev, townWard);
    await mkdir(join(outDir, dirname(rovRelPath)), { recursive: true });
    await writeFile(
      join(outDir, rovRelPath),
      spot ? await convertPdfToSpotColor(rovPdf, spot) : rovPdf
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
