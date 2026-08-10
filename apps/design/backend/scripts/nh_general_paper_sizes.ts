import {
  Election,
  getContests,
  HmpbBallotPaperSize,
  safeParseNumber,
  YesNoContest,
} from '@votingworks/types';
import {
  ballotTemplates,
  createPlaywrightRendererPool,
  RenderDocument,
  Renderer,
  renderBallotTemplate,
} from '@votingworks/hmpb';
import { assertDefined, iter, unique } from '@votingworks/basics';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { convertNhElection, NhBallotStyleSchema } from './convert_nh_election';
import { generateId } from '../src/utils';

// Estimates the ballot paper length each town needs for the NH state general
// election, using the state's mock election exports (one AVSInterface JSON per
// town/ward) plus the two statewide ballot questions. A paper size fits when:
//   1. Every state representative contest stays on the front page. Contests
//      after them (county offices, questions) may flow onto the back.
//   2. The ballot fits on a single sheet (no content past page 2).
//   3. In hand count towns, back-page content leaves the bottom-right quadrant
//      clear for the hand count insignia.
// Only paper sizes supported on v4.0 are considered (no 18" or 20").

const V4_SIZE_ORDER: HmpbBallotPaperSize[] = [
  HmpbBallotPaperSize.Letter,
  HmpbBallotPaperSize.Legal,
  HmpbBallotPaperSize.Custom17,
  HmpbBallotPaperSize.Custom19,
  HmpbBallotPaperSize.Custom22,
];

function paperSizeLabel(size: HmpbBallotPaperSize): string {
  switch (size) {
    case HmpbBallotPaperSize.Letter:
      return '8.5 x 11';
    case HmpbBallotPaperSize.Legal:
      return '8.5 x 14';
    default:
      return size.replace('custom-', '').replace('x', ' x ');
  }
}

// The two questions on the 2026 general election ballot, from the Secretary of
// State's "Questions on General Election Ballot 2026.docx".
const BALLOT_QUESTIONS: Array<{ title: string; description: string }> = [
  {
    title:
      'Constitutional Amendment Question - Eliminating the Office of Register of Probate (CACR 13)',
    description: `“Are you in favor of eliminating the office of register of probate by amending articles 71 and 81 of the second part of the constitution to read as follows: [Art.] 71. [County Treasurers, County Attorneys, Sheriffs, and Registers of Deeds Elected.] The county treasurers, county attorneys, sheriffs and registers of deeds, shall be elected by the inhabitants of the several towns, in the several counties in the State, according to the method now practiced, and the laws of the state, provided nevertheless the legislature shall have authority to alter the manner of certifying the votes, and the mode of electing those officers; but not so as to deprive the people of the right they now have of electing them. [Art.] 81. [Judges Not to Act as Counsel.] No judge shall be of counsel, act as advocate, or receive any fees as advocate or counsel, in any probate business which is pending, or may be brought into any court of probate in the county of which he or she is judge.” (Passed by the N.H. House 325 Yes 15 No; Passed by the Senate 23 Yes 1 No) CACR 13`,
  },
  {
    title:
      'Question Relating to School District Local Tax Cap and School Administrative Fixed Cap',
    description: `“Shall the [name of municipality] limit property tax growth for [name(s) of school district(s)] under RSA 32:5-i? If adopted for a two-year period: (1) the local property tax levy may not grow beyond the prior year’s amount, adjusted for inflation and new construction; (2) SAU central office spending may not exceed 6 percent of total school district appropriations; and (3) bonded capital costs are excluded from both limits. These caps apply only to administrative operations of the SAU central office and do not affect classroom instruction, school-based services, or other municipal expenditures. These limits may be overridden as provided in RSA 32:5-i. Adoption requires a three-fifths (3/5) majority vote.”`,
  },
];

// Towns that hand count (no scanner), as delivered in the 2026 state primary
// drop: the towns under "NH State Primary 2026/Hand Count*". Every other town
// is treated as a machine count town for this estimate (towns absent from the
// primary drop use another vendor's scanners).
const HAND_COUNT_TOWNS: readonly string[] = [
  'ACWORTH',
  'ALBANY',
  'ALEXANDRIA',
  'ALSTEAD',
  'ANDOVER',
  'AT.& GIL. AC. GT.',
  'BATH',
  "BEAN'S GRANT",
  "BEAN'S PURCHASE",
  'BENNINGTON',
  'BENTON',
  'BRADFORD',
  'BRIDGEWATER',
  'BROOKFIELD',
  'CAMBRIDGE',
  'CENTER HARBOR',
  'CHANDLERS PURCHASE',
  'CHATHAM',
  'CHICHESTER',
  'CLARKSVILLE',
  'COLEBROOK',
  'COLUMBIA',
  'CORNISH',
  "CRAWFORD'S PURCHASE",
  'CROYDON',
  "CUTT'S GRANT",
  'DALTON',
  'DANBURY',
  'DEERING',
  "DIX'S GRANT",
  'DIXVILLE',
  'DORCHESTER',
  'DUBLIN',
  'DUMMER',
  'DUNBARTON',
  'EASTON',
  'EATON',
  'ELLSWORTH',
  'ERROL',
  "ERVING'S LOCATION",
  'FREEDOM',
  'GILSUM',
  'GOSHEN',
  "GREEN'S GRANT",
  'GREENFIELD',
  'GREENVILLE',
  'GROTON',
  "HADLEY'S PURCHASE",
  "HALE'S LOCATION",
  'HANCOCK',
  "HART'S LOCATION",
  'HEBRON',
  'HILL',
  'HOLDERNESS',
  'JEFFERSON',
  'KILKENNY',
  'LANCASTER',
  'LANDAFF',
  'LANGDON',
  'LEMPSTER',
  'LIVERMORE',
  'LOW & BURBANKS GRANT',
  'LYMAN',
  'LYME',
  'LYNDEBOROUGH',
  'MARLOW',
  "MARTIN'S LOCATION",
  'MASON',
  'MILLSFIELD',
  'MONROE',
  'NELSON',
  'NORTHUMBERLAND',
  'ODELL',
  'ORANGE',
  'ORFORD',
  'PIERMONT',
  "PINKHAM'S GRANT",
  'PITTSBURG',
  'PLAINFIELD',
  'RANDOLPH',
  'RICHMOND',
  'ROXBURY',
  'RUMNEY',
  'SALISBURY',
  'SANDWICH',
  "SARGENT'S PURCHASE",
  'SECOND COLLEGE GRANT',
  'SHARON',
  'SHELBURNE',
  'SOUTH HAMPTON',
  'STARK',
  'STEWARTSTOWN',
  'STRATFORD',
  'SUCCESS',
  'SULLIVAN',
  'SURRY',
  'TEMPLE',
  "THOMPSON & MESERVE'S PURCHASE",
  'TUFTONBORO',
  'UNITY',
  'WARNER',
  'WARREN',
  'WASHINGTON',
  'WATERVILLE VALLEY',
  'WEBSTER',
  'WENTWORTH',
  "WENTWORTH'S LOCATION",
  'WHITEFIELD',
  'WILMOT',
  'WINDSOR',
];

function normalizeTownName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const HAND_COUNT_TOWNS_NORMALIZED: ReadonlySet<string> = new Set(
  HAND_COUNT_TOWNS.map(normalizeTownName)
);

// The general election mock exports are named `<TOWN>_V<version>_<id>.json`,
// one file per town/ward.
const GENERAL_FILENAME = /^(.+)_V(\d+)_(\d+)\.json$/;

interface GeneralTownGroup {
  townName: string;
  paths: string[];
}

export function discoverGeneralTowns(dir: string): GeneralTownGroup[] {
  // Keep the highest version per (town, file id).
  const bestByKey = new Map<string, { path: string; version: number }>();
  for (const entry of readdirSync(dir)) {
    const match = entry.match(GENERAL_FILENAME);
    if (!match) continue;
    const [, town, versionText, id] = match;
    const version = safeParseNumber(versionText).unsafeUnwrap();
    const key = `${town}|${id}`;
    const existing = bestByKey.get(key);
    if (!existing || version > existing.version) {
      bestByKey.set(key, { path: join(dir, entry), version });
    }
  }
  const byTown = new Map<string, string[]>();
  for (const [key, { path }] of bestByKey) {
    const town = key.split('|')[0];
    byTown.set(town, [...(byTown.get(town) ?? []), path]);
  }
  return [...byTown]
    .map(([townName, paths]) => ({ townName, paths: [...paths].sort() }))
    .sort((a, b) => a.townName.localeCompare(b.townName));
}

/** Adds the two statewide ballot questions to every ballot style. */
export function addBallotQuestions(election: Election): Election {
  // The Governor contest is statewide, so its district is on every ballot
  // style; assigning the questions to it puts them on every ballot.
  const governor = assertDefined(
    election.contests.find((contest) => contest.title === 'Governor'),
    'expected a Governor contest on every general ballot'
  );
  const questions: YesNoContest[] = BALLOT_QUESTIONS.map((question) => ({
    id: generateId(),
    type: 'yesno',
    title: question.title,
    description: question.description,
    districtId: governor.districtId,
    options: [
      { id: generateId(), label: 'Yes' },
      { id: generateId(), label: 'No' },
    ],
  }));
  return { ...election, contests: [...election.contests, ...questions] };
}

const STATE_REP_TITLE = /^State Representatives?\b/;

interface PageEvaluation {
  fits: boolean;
  failReasons: string[];
  backContestTitles: string[];
}

async function evaluateDocument(
  document: RenderDocument,
  election: Election,
  isHandCount: boolean,
  allCandidatesOnFront: boolean
): Promise<PageEvaluation> {
  const pages = await document.inspectElements('.page');
  const bubbles = await document.inspectElements('.bubble');
  const contestsById = new Map(
    election.contests.map((contest) => [contest.id, contest])
  );

  const failReasons: string[] = [];
  const backContestTitles: string[] = [];
  for (const bubble of bubbles) {
    const pageIndex = pages.findIndex(
      (page) => bubble.y >= page.y && bubble.y < page.y + page.height
    );
    const pageNumber = pageIndex + 1;
    if (pageNumber === 1) continue;

    const optionInfo = JSON.parse(
      (bubble.data as Record<string, string>)['optionInfo']
    ) as { contestId: string };
    const contest = assertDefined(contestsById.get(optionInfo.contestId));
    if (!backContestTitles.includes(contest.title)) {
      backContestTitles.push(contest.title);
    }

    if (pageNumber > 2) {
      failReasons.push('content past a single sheet');
    }
    if (STATE_REP_TITLE.test(contest.title)) {
      failReasons.push('state representative contest off the front');
    }
    if (allCandidatesOnFront && contest.type === 'candidate') {
      failReasons.push('candidate contest off the front');
    }
    if (isHandCount) {
      // The hand count insignia fills the bottom-right quadrant of the back
      // page; content that reaches into that quadrant would cover it.
      const page = pages[pageIndex];
      const quadrant: { x: number; y: number } = {
        x: page.x + page.width / 2,
        y: page.y + page.height / 2,
      };
      if (
        bubble.x + bubble.width > quadrant.x &&
        bubble.y + bubble.height > quadrant.y
      ) {
        failReasons.push('back content covers the hand count insignia');
      }
    }
  }
  return {
    fits: failReasons.length === 0,
    failReasons: [...new Set(failReasons)],
    backContestTitles,
  };
}

interface TownResult {
  townName: string;
  variant: 'HandCount' | 'Machine';
  wardCount: number;
  paperSize: HmpbBallotPaperSize;
  overflowedAtMax: boolean;
  backCandidateContests: string[];
  backQuestions: number;
  failReasonsAtMax: string[];
}

async function sizeTown(
  renderer: Renderer,
  town: GeneralTownGroup,
  allCandidatesOnFront: boolean
): Promise<TownResult> {
  const nhBallotStyles = town.paths.map((path) =>
    NhBallotStyleSchema.parse(JSON.parse(readFileSync(path, 'utf-8')))
  );
  const baseElection = addBallotQuestions(convertNhElection(nhBallotStyles));
  const isHandCount = HAND_COUNT_TOWNS_NORMALIZED.has(
    normalizeTownName(town.townName)
  );

  // Check the densest ballot styles first so a failing size is ruled out with
  // as few renders as possible.
  const stylesByDensity = [...baseElection.ballotStyles].sort((a, b) => {
    function optionRows(ballotStyle: typeof a): number {
      return iter(getContests({ election: baseElection, ballotStyle }))
        .map((contest) =>
          contest.type === 'candidate'
            ? contest.candidates.length + contest.seats
            : 2
        )
        .sum();
    }
    return optionRows(b) - optionRows(a);
  });

  let lastEvaluations: PageEvaluation[] = [];
  for (const [sizeIndex, paperSize] of V4_SIZE_ORDER.entries()) {
    const election: Election = {
      ...baseElection,
      ballotLayout: { ...baseElection.ballotLayout, paperSize },
    };
    let allFit = true;
    lastEvaluations = [];
    for (const ballotStyle of stylesByDensity) {
      const document = (
        await renderBallotTemplate(renderer, ballotTemplates.NhStateBallot, {
          election,
          ballotStyleId: ballotStyle.id,
          precinctId: ballotStyle.precincts[0],
          ballotType: 'precinct',
          ballotMode: 'official',
          watermark: 'PROOF',
          isHandCount,
          isFederalOfficeOnly: false,
          isUocava: false,
        })
      ).unsafeUnwrap();
      const evaluation = await evaluateDocument(
        document,
        election,
        isHandCount,
        allCandidatesOnFront
      );
      lastEvaluations.push(evaluation);
      if (!evaluation.fits) {
        allFit = false;
        break;
      }
    }
    if (allFit || sizeIndex === V4_SIZE_ORDER.length - 1) {
      const backTitles = unique(
        lastEvaluations.flatMap((e) => e.backContestTitles)
      );
      const questionTitles = new Set(BALLOT_QUESTIONS.map((q) => q.title));
      return {
        townName: baseElection.jurisdiction.name,
        variant: isHandCount ? 'HandCount' : 'Machine',
        wardCount: baseElection.precincts.length,
        paperSize,
        overflowedAtMax: !allFit,
        backCandidateContests: backTitles.filter(
          (title) => !questionTitles.has(title)
        ),
        backQuestions: backTitles.filter((title) => questionTitles.has(title))
          .length,
        failReasonsAtMax: allFit
          ? []
          : unique(lastEvaluations.flatMap((e) => e.failReasons)),
      };
    }
  }
  /* istanbul ignore next -- unreachable */
  throw new Error('unreachable');
}

const USAGE = `Usage: nh_general_paper_sizes <general-json-dir> [out-csv] [--all-candidates-front]

--all-candidates-front: require every candidate contest on the front (only the
questions may flow to the back), instead of only the state rep contests.`;

export async function main(args: readonly string[]): Promise<number> {
  const allCandidatesOnFront = args.includes('--all-candidates-front');
  const positional = args.filter((arg) => !arg.startsWith('--'));
  if (positional.length < 1) {
    console.error(USAGE);
    return 1;
  }
  const [jsonDir, outCsv] = positional;

  const towns = discoverGeneralTowns(jsonDir);
  console.log(`Sizing ${towns.length} town(s)...\n`);

  const pool = await createPlaywrightRendererPool();
  let results: TownResult[];
  try {
    results = await pool.runTasks(
      towns.map(
        (town) => (renderer: Renderer) =>
          sizeTown(renderer, town, allCandidatesOnFront)
      ),
      (done, total) => {
        if (done === total || done % 20 === 0) {
          console.log(`  sized ${done}/${total} towns`);
        }
      }
    );
  } finally {
    await pool.close();
  }

  results = [...results].sort((a, b) => a.townName.localeCompare(b.townName));

  const bySize = new Map<
    HmpbBallotPaperSize,
    { towns: number; wards: number }
  >();
  for (const result of results) {
    const entry = bySize.get(result.paperSize) ?? { towns: 0, wards: 0 };
    entry.towns += 1;
    entry.wards += result.wardCount;
    bySize.set(result.paperSize, entry);
  }

  console.log('\n=== Ballot size breakdown ===');
  for (const size of V4_SIZE_ORDER) {
    const entry = bySize.get(size);
    if (!entry) continue;
    console.log(
      `${paperSizeLabel(size).padEnd(10)} - ${String(entry.towns).padStart(
        3
      )} towns, ${String(entry.wards).padStart(3)} wards`
    );
  }
  const totalTowns = results.length;
  const totalWards = results.reduce((sum, r) => sum + r.wardCount, 0);
  console.log(
    `${'TOTAL'.padEnd(10)} - ${totalTowns} towns, ${totalWards} wards`
  );

  const withCandidatesOnBack = results.filter(
    (r) => r.backCandidateContests.length > 0
  );
  console.log(
    `\n${withCandidatesOnBack.length} town(s) have candidate contests on the back at their chosen size.`
  );

  const overflowed = results.filter((r) => r.overflowedAtMax);
  if (overflowed.length > 0) {
    console.log(
      `\n⚠ ${overflowed.length} town(s) still overflow at the largest size:`
    );
    for (const r of overflowed) {
      console.log(
        `  ${r.townName} (${r.variant}): ${r.failReasonsAtMax.join('; ')}`
      );
    }
  }

  if (outCsv) {
    await mkdir(dirname(outCsv), { recursive: true });
    const header =
      'Town,Variant,Wards,PaperSize,QuestionsOnBack,CandidateContestsOnBack,OverflowedAtMax\n';
    const rows = results
      .map((r) =>
        [
          r.townName,
          r.variant,
          r.wardCount,
          paperSizeLabel(r.paperSize),
          r.backQuestions,
          `"${r.backCandidateContests.join('; ')}"`,
          r.overflowedAtMax,
        ].join(',')
      )
      .join('\n');
    await writeFile(outCsv, `${header}${rows}\n`);
    console.log(`\nWrote ${outCsv}`);
  }

  return 0;
}

/* istanbul ignore next */
if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
