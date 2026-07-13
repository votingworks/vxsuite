import {
  BallotType,
  Election,
  ElectionPackageFileName,
  ElectionPackageMetadata,
  EncodedBallotEntry,
  getContests,
  HmpbBallotPaperSize,
  LanguageCode,
  LATEST_METADATA,
  DEFAULT_SYSTEM_SETTINGS,
  formatElectionHashes,
  mergeUiStrings,
} from '@votingworks/types';
import {
  ballotTemplates,
  convertPdfToSpotColor,
  createPlaywrightRendererPool,
  hmpbStringsCatalog,
  renderAllBallotPdfsAndCreateElectionDefinition,
  renderBallotTemplate,
  renderNhRovForm,
  spotColorForParty,
  ElectionSerializationOptions,
  RenderDocument,
  Renderer,
  RendererPool,
} from '@votingworks/hmpb';
import type { NhStateBallotProps } from '@votingworks/hmpb';
import { getAllStringsForElectionPackage } from '@votingworks/backend';
import { assertDefined } from '@votingworks/basics';
import { sha256 } from 'js-sha256';
import JsZip from 'jszip';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  addPollingPlacesForExport,
  createBallotPropsForTemplate,
  formatElectionForExport,
} from '../src/ballots';
import { getBallotPdfFileName } from '../src/utils';
import { convertNhElection, NhBallotStyleSchema } from './convert_nh_election';
import {
  discoverBallotStyleFiles,
  groupByTown,
  resolveLatestVersions,
  TownGroup,
} from './nh_delivery';

// NH elections serialize at software version v4.0. cdf is asserted incompatible
// with v4.0, so the format must be vxf.
const SERIALIZATION_OPTIONS: ElectionSerializationOptions = {
  format: 'vxf',
  version: 'v4.0',
};

// Fixed date for ZIP entries to make archive output deterministic (matches the
// VxDesign export worker).
const FIXED_ZIP_DATE = new Date('2024-01-01T00:00:00Z');

// English-only: getAllStringsForElectionPackage never invokes the translator
// for English, so a stub is sufficient and no GCP credentials are needed.
const STUB_TRANSLATOR = {} as unknown as Parameters<
  typeof getAllStringsForElectionPackage
>[1];
const ENGLISH_ONLY = [{ languages: [LanguageCode.ENGLISH] }];

// Paper sizes tried in ascending height order for auto-fit (from render_nh_batch).
const SIZE_ORDER: HmpbBallotPaperSize[] = [
  HmpbBallotPaperSize.Letter,
  HmpbBallotPaperSize.Legal,
  HmpbBallotPaperSize.Custom17,
  HmpbBallotPaperSize.Custom18,
  HmpbBallotPaperSize.Custom19,
  HmpbBallotPaperSize.Custom20,
  HmpbBallotPaperSize.Custom22,
];
const BACK_PAGE_BUBBLE_SELECTOR = '.page[data-page-number="2"] .bubble';

function sanitize(name: string): string {
  return name.replace(/[^\w -]/g, '').trim();
}

function createDeterministicZip(): JsZip {
  const zip = new JsZip();
  const originalFile = zip.file.bind(zip);
  zip.file = ((name: string, data: unknown, opts?: JsZip.JSZipFileOptions) =>
    originalFile(name, data as never, {
      date: FIXED_ZIP_DATE,
      ...(opts ?? {}),
    })) as typeof zip.file;
  return zip;
}

async function documentOverflowsToBack(
  document: RenderDocument
): Promise<boolean> {
  const backBubbles = await document.inspectElements(BACK_PAGE_BUBBLE_SELECTOR);
  return backBubbles.length > 0;
}

// The ballot style most likely to overflow: most option rows.
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

// Pick the smallest paper size on which the town's largest ballot style keeps
// all contests off the back page. The package path does not auto-fit, so the
// chosen size must be baked into the election before rendering.
async function autoFitPaperSize(
  renderer: Renderer,
  election: Election,
  isHandCount: boolean
): Promise<HmpbBallotPaperSize> {
  const probeId = largestBallotStyleId(election);
  for (const paperSize of SIZE_ORDER) {
    const sized: Election = {
      ...election,
      ballotLayout: { ...election.ballotLayout, paperSize },
    };
    const document = (
      await renderBallotTemplate(renderer, ballotTemplates.NhStateBallot, {
        election: sized,
        ballotMode: 'official',
        ballotType: BallotType.Precinct,
        ballotStyleId: probeId,
        precinctId: assertDefined(
          sized.ballotStyles.find((b) => b.id === probeId)
        ).precincts[0],
        isHandCount,
      })
    ).unsafeUnwrap();
    if (!(await documentOverflowsToBack(document))) {
      return paperSize;
    }
  }
  return SIZE_ORDER[SIZE_ORDER.length - 1];
}

interface TownResult {
  townName: string;
  variant: string;
  paperSize: HmpbBallotPaperSize;
  packageFile: string;
  ballotCount: number;
}

async function renderTownPackage(
  pool: RendererPool,
  town: TownGroup,
  outDir: string
): Promise<TownResult> {
  const nhBallotStyles = town.files.map((file) =>
    NhBallotStyleSchema.parse(JSON.parse(readFileSync(file.path, 'utf-8')))
  );
  const isHandCount = town.variant === 'HandCount';
  const baseElection = convertNhElection(nhBallotStyles);
  const townName = baseElection.jurisdiction.name;

  // 1. Auto-fit paper size and bake it in.
  const paperSize = await pool.runTask((renderer) =>
    autoFitPaperSize(renderer, baseElection, isHandCount)
  );
  const sizedElection: Election = {
    ...baseElection,
    ballotLayout: { ...baseElection.ballotLayout, paperSize },
  };

  // 2. Polling places (NH generates them from precincts; our converter leaves
  //    them empty).
  // addPollingPlacesForExport reads jurisdiction.stateCode (NH generates
  // polling places from precincts) and systemSettings.enableEarlyVoting (NH
  // has no early voting), so a minimal stub plus the default settings suffice.
  const jurisdictionStub = { stateCode: 'NH' } as const;
  const withPollingPlaces = addPollingPlacesForExport(
    sizedElection,
    jurisdictionStub as unknown as Parameters<
      typeof addPollingPlacesForExport
    >[1],
    DEFAULT_SYSTEM_SETTINGS
  );

  // 3. Strings (English only).
  const [appStrings, hmpbStrings, electionStrings] =
    await getAllStringsForElectionPackage(
      withPollingPlaces,
      STUB_TRANSLATOR,
      hmpbStringsCatalog,
      ENGLISH_ONLY
    );
  const ballotStrings = mergeUiStrings(electionStrings, hmpbStrings);

  // 4. Format for export (injects merged ballot strings + hash inputs).
  const election = formatElectionForExport(withPollingPlaces, ballotStrings);

  // 5. Ballot props: production matrix, official + sample only, with the NH
  //    hand-count flag the matrix does not set. No PROOF watermark.
  const allProps = createBallotPropsForTemplate(
    'NhStateBallot',
    election,
    /* compact */ false
  ) as NhStateBallotProps[];
  const props = allProps
    .filter((p) => p.ballotMode === 'official' || p.ballotMode === 'sample')
    .map((p) => ({ ...p, isHandCount }));

  // 6. Render all ballots + build the v4.0 election definition.
  const { ballotPdfs: renderedBallotPdfs, electionDefinition } =
    await renderAllBallotPdfsAndCreateElectionDefinition(
      pool,
      ballotTemplates.NhStateBallot,
      props,
      SERIALIZATION_OPTIONS
    );

  // Convert each ballot to two-ink spot color for printing: the party tint on
  // its named spot plate, everything else on a single black plate. Both the
  // package-encoded ballots and the loose copies use the print-ready version.
  const ballotPdfs = await Promise.all(
    renderedBallotPdfs.map((pdf, i) => {
      const ballotStyle = assertDefined(
        election.ballotStyles.find((bs) => bs.id === props[i].ballotStyleId)
      );
      const party = election.parties.find((p) => p.id === ballotStyle.partyId);
      const spot = party && spotColorForParty(party);
      return spot ? convertPdfToSpotColor(pdf, spot) : Promise.resolve(pdf);
    })
  );

  // 7. Assemble the election package zip (8 standard entries; audio omitted).
  const metadata: ElectionPackageMetadata = LATEST_METADATA;
  const zip = createDeterministicZip();
  zip.file(ElectionPackageFileName.METADATA, JSON.stringify(metadata, null, 2));
  zip.file(
    ElectionPackageFileName.APP_STRINGS,
    JSON.stringify(appStrings, null, 2)
  );
  zip.file(ElectionPackageFileName.ELECTION, electionDefinition.electionData);
  zip.file(
    ElectionPackageFileName.SYSTEM_SETTINGS,
    JSON.stringify(DEFAULT_SYSTEM_SETTINGS, null, 2)
  );
  zip.file(
    ElectionPackageFileName.REGISTERED_VOTER_COUNTS,
    JSON.stringify({}, null, 2)
  );
  const encodedBallots = props
    .map((p, i) => {
      const entry: EncodedBallotEntry = {
        ballotStyleId: p.ballotStyleId,
        precinctId: p.precinctId,
        ballotType: p.ballotType,
        ballotMode: p.ballotMode,
        watermark: p.watermark,
        // NH state ballots ignore `compact` (the template omits it); it's built
        // with compact: false, so record that.
        compact: false,
        ballotAuditId: p.ballotAuditId,
        encodedBallot: Buffer.from(ballotPdfs[i]).toString('base64'),
      };
      return JSON.stringify(entry);
    })
    .join('\n');
  zip.file(ElectionPackageFileName.BALLOTS, `${encodedBallots}\n`);

  const zipContents = await zip.generateAsync({
    type: 'nodebuffer',
    streamFiles: true,
  });
  const combinedHash = formatElectionHashes(
    electionDefinition.ballotHash,
    sha256(zipContents)
  );

  // 8. Write handoff artifacts: package zip, loose ballot PDFs, ROV forms.
  const townDir = join(outDir, sanitize(townName));
  await mkdir(join(townDir, 'ballots'), { recursive: true });
  await mkdir(join(townDir, 'rov'), { recursive: true });

  const packageName = `election-package-${combinedHash}.zip`;
  await writeFile(join(townDir, packageName), zipContents);

  // Loose ballot PDFs for the handoff. Inject the party abbrev into the
  // production filename so DEM/REP ballots are legible at a glance (the encoded
  // ballots inside the package keep the standard scheme).
  await Promise.all(
    props.map((p, i) => {
      const ballotStyle = assertDefined(
        election.ballotStyles.find((bs) => bs.id === p.ballotStyleId)
      );
      const party = election.parties.find(
        (pp) => pp.id === ballotStyle.partyId
      );
      const fileName = party
        ? getBallotPdfFileName(p).replace(
            p.ballotStyleId,
            `${party.abbrev}-${p.ballotStyleId}`
          )
        : getBallotPdfFileName(p);
      return writeFile(join(townDir, 'ballots', fileName), ballotPdfs[i]);
    })
  );

  // Return of Votes form per ballot style. Render them in a single pool batch --
  // the renderer pool allows only one set of tasks running at a time.
  const rovLabels = election.ballotStyles.map((ballotStyle) => {
    const precinct = assertDefined(
      election.precincts.find((p) => p.id === ballotStyle.precincts[0])
    );
    const party = election.parties.find((p) => p.id === ballotStyle.partyId);
    const ward = precinct.name === townName ? '' : ` ${precinct.name}`;
    return sanitize(`${townName}${ward} ${party ? party.name : ''}`);
  });
  const rovPdfs = await pool.runTasks(
    election.ballotStyles.map((ballotStyle) => async (renderer: Renderer) => {
      const rov = await renderNhRovForm(renderer, { election, ballotStyle });
      return rov.renderToPdf();
    })
  );
  await Promise.all(
    rovPdfs.map(async (pdf, i) => {
      const party = election.parties.find(
        (p) => p.id === election.ballotStyles[i].partyId
      );
      const spot = party && spotColorForParty(party);
      const rovPdf = spot ? await convertPdfToSpotColor(pdf, spot) : pdf;
      return writeFile(
        join(townDir, 'rov', `${rovLabels[i]} - ROV.pdf`),
        rovPdf
      );
    })
  );

  return {
    townName,
    variant: town.variant,
    paperSize,
    packageFile: join(townDir, packageName),
    ballotCount: props.length,
  };
}

const USAGE = `Usage: render_nh_election_package <delivery-dir> <out-dir> <town-name-filter>

Generates a production-quality v4.0 election package (+ official/sample ballot
PDFs and ROV forms) for each town matching the filter.`;

export async function main(args: readonly string[]): Promise<number> {
  if (args.length < 3) {
    console.error(USAGE);
    return 1;
  }
  const [deliveryDir, outDir, filter] = args;
  await mkdir(outDir, { recursive: true });

  const { resolved } = resolveLatestVersions(
    discoverBallotStyleFiles(deliveryDir)
  );
  const matching = groupByTown(resolved).filter((t) =>
    t.townName.toLowerCase().includes(filter.toLowerCase())
  );
  // Hand-count towns aren't machine-scanned, so they don't get an election
  // package -- skip them (they still get proofs via render_nh_batch).
  const handCount = matching.filter((t) => t.variant === 'HandCount');
  if (handCount.length > 0) {
    console.log(
      `Skipping ${
        handCount.length
      } hand-count town(s) (no election package needed): ${handCount
        .map((t) => t.townName)
        .join(', ')}`
    );
  }
  const towns = matching.filter((t) => t.variant !== 'HandCount');
  if (towns.length === 0) {
    console.error(`No VotingWorks towns match filter "${filter}"`);
    return 1;
  }
  console.log(`Generating packages for ${towns.length} town(s) -> ${outDir}\n`);

  const pool = await createPlaywrightRendererPool();
  try {
    for (const town of towns) {
      const result = await renderTownPackage(pool, town, outDir);
      console.log(
        `${result.townName} (${result.variant}): ${result.ballotCount} ballots, ` +
          `${result.paperSize} -> ${result.packageFile}`
      );
    }
  } finally {
    await pool.close();
  }
  return 0;
}

/* istanbul ignore next */
if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
