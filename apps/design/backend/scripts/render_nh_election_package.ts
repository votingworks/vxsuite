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
  formatElectionHashes,
  mergeUiStrings,
} from '@votingworks/types';
import {
  ballotTemplates,
  convertPdfToSpotColor,
  createPlaywrightRendererPool,
  hmpbStringsCatalog,
  reducePdfToFirstPage,
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
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  addPollingPlacesForExport,
  createBallotPropsForTemplate,
  formatElectionForExport,
} from '../src/ballots';
import { stateDefaultSystemSettings } from '../src/system_settings';
import { convertNhElection, NhBallotStyleSchema } from './convert_nh_election';
import {
  discoverBallotStyleFiles,
  groupByTown,
  resolveLatestVersions,
  TownGroup,
} from './nh_delivery';
import {
  deliverableBallotPath,
  deliverablePackagePath,
  deliverableRovPath,
  deliverableType,
} from './nh_deliverable_layout';
import { readNhBallotStyleFile } from './nh_xml';

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
  // Hand-count towns get ballots + ROV forms but no election package.
  packageFile?: string;
  ballotCount: number;
}

async function renderTownPackage(
  pool: RendererPool,
  town: TownGroup,
  outDir: string
): Promise<TownResult> {
  const nhBallotStyles = town.files.map((file) =>
    NhBallotStyleSchema.parse(readNhBallotStyleFile(file.path))
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
  // has no early voting), so a minimal stub plus the NH default settings
  // suffice.
  const jurisdictionStub = { stateCode: 'NH' } as const;
  const withPollingPlaces = addPollingPlacesForExport(
    sizedElection,
    jurisdictionStub as unknown as Parameters<
      typeof addPollingPlacesForExport
    >[1],
    stateDefaultSystemSettings.NH
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

  // Per ballot style, the town/ward label and party used to place its PDFs in
  // the deliverable tree.
  function ballotStyleLabels(ballotStyleId: string) {
    const ballotStyle = assertDefined(
      election.ballotStyles.find((bs) => bs.id === ballotStyleId)
    );
    const party = election.parties.find((p) => p.id === ballotStyle.partyId);
    const partyAbbrev = party ? party.abbrev : 'NONPARTISAN';
    const precinct = assertDefined(
      election.precincts.find((p) => p.id === ballotStyle.precincts[0])
    );
    const ward = precinct.name === townName ? '' : ` ${precinct.name}`;
    return { party, partyAbbrev, townWard: sanitize(`${townName}${ward}`) };
  }

  // 7. Machine-scannable towns get an election package zip (8 standard entries,
  //    audio omitted). Hand-count towns are never scanned, so they get no
  //    package. Zips live flat under <out-dir>/election-packages/.
  let packageFile: string | undefined;
  if (!isHandCount) {
    const metadata: ElectionPackageMetadata = LATEST_METADATA;
    const zip = createDeterministicZip();
    zip.file(
      ElectionPackageFileName.METADATA,
      JSON.stringify(metadata, null, 2)
    );
    zip.file(
      ElectionPackageFileName.APP_STRINGS,
      JSON.stringify(appStrings, null, 2)
    );
    zip.file(ElectionPackageFileName.ELECTION, electionDefinition.electionData);
    zip.file(
      ElectionPackageFileName.SYSTEM_SETTINGS,
      JSON.stringify(stateDefaultSystemSettings.NH, null, 2)
    );
    zip.file(
      ElectionPackageFileName.REGISTERED_VOTER_COUNTS,
      JSON.stringify({}, null, 2)
    );
    // Only machine-scannable ballots belong in the encoded set. Sample,
    // federal-office-only, and UOCAVA variants intentionally have no timing
    // marks (NH hand-counts them), so scanning them fails; exclude them all.
    // Their loose PDFs are still written below for the handoff.
    const encodedBallots = props
      .map((p, i) => ({ p, i }))
      .filter(
        ({ p }) =>
          p.ballotMode === 'official' && !p.isFederalOfficeOnly && !p.isUocava
      )
      .map(({ p, i }) => {
        const entry: EncodedBallotEntry = {
          ballotStyleId: p.ballotStyleId,
          precinctId: p.precinctId,
          ballotType: p.ballotType,
          ballotMode: p.ballotMode,
          watermark: p.watermark,
          // NH state ballots ignore `compact` (the template omits it); it's
          // built with compact: false, so record that.
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
    const relPath = deliverablePackagePath(sanitize(townName), combinedHash);
    await mkdir(join(outDir, dirname(relPath)), { recursive: true });
    packageFile = join(outDir, relPath);
    await writeFile(packageFile, zipContents);
  }

  // 8. Loose ballot PDFs for the handoff, organized as
  //    <out-dir>/<type>/<party>/<town-or-ward> - <party> - <type>.pdf.
  //    Field-distributed variants (federal-office-only + UOCAVA) are reduced to
  //    a single page.
  await Promise.all(
    props.map(async (p, i) => {
      const { partyAbbrev, townWard } = ballotStyleLabels(p.ballotStyleId);
      const singleSided = p.isFederalOfficeOnly || p.isUocava;
      const pdf = singleSided
        ? await reducePdfToFirstPage(ballotPdfs[i])
        : ballotPdfs[i];
      const relPath = deliverableBallotPath(
        deliverableType(p),
        partyAbbrev,
        townWard
      );
      await mkdir(join(outDir, dirname(relPath)), { recursive: true });
      return writeFile(join(outDir, relPath), pdf);
    })
  );

  // 9. Return of Votes form per ballot style, into the parallel rov/ tree.
  //    Render them in a single pool batch -- the renderer pool allows only one
  //    set of tasks running at a time.
  const rovPdfs = await pool.runTasks(
    election.ballotStyles.map((ballotStyle) => async (renderer: Renderer) => {
      const rov = await renderNhRovForm(renderer, { election, ballotStyle });
      return rov.renderToPdf();
    })
  );
  await Promise.all(
    rovPdfs.map(async (pdf, i) => {
      const { party, partyAbbrev, townWard } = ballotStyleLabels(
        election.ballotStyles[i].id
      );
      const spot = party && spotColorForParty(party);
      const rovPdf = spot ? await convertPdfToSpotColor(pdf, spot) : pdf;
      const relPath = deliverableRovPath(partyAbbrev, townWard);
      await mkdir(join(outDir, dirname(relPath)), { recursive: true });
      return writeFile(join(outDir, relPath), rovPdf);
    })
  );

  return {
    townName,
    variant: town.variant,
    paperSize,
    packageFile,
    ballotCount: props.length,
  };
}

const USAGE = `Usage: render_nh_election_package <delivery-dir> <out-dir> [town-name-filter]

Generates the final (unwatermarked) ballot deliverable for all towns, organized
as <out-dir>/<type>/<party>/<town-or-ward> - <party> - <type>.pdf, plus ROV forms
under <out-dir>/rov/. Machine-scanned (VotingWorks) towns additionally get a
production v4.0 election package zip at <out-dir>/<town>/ for VxQA.`;

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
  console.log(`Generating ${towns.length} town(s) -> ${outDir}\n`);

  const pool = await createPlaywrightRendererPool();
  try {
    for (const town of towns) {
      const result = await renderTownPackage(pool, town, outDir);
      console.log(
        `${result.townName} (${result.variant}): ${result.ballotCount} ballots, ` +
          `${result.paperSize}` +
          `${
            result.packageFile ? ` -> ${result.packageFile}` : ' (no package)'
          }`
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
