import { assert, assertDefined, iter, sleep } from '@votingworks/basics';
import {
  getAllStringsForElectionPackage,
  GoogleCloudTranslator,
} from '@votingworks/backend';
import {
  ballotTemplates,
  createPlaywrightRendererPool,
  hmpbStringsCatalog,
  convertPdfFileToGrayscale,
  countBallotPages,
  ElectionSerializationOptions,
  NhStateBallotProps,
  renderAllBallotPdfsAndCreateElectionDefinition,
  renderBallotTemplate,
  renderNhStateRovForm,
  Renderer,
  ScratchDir,
  RendererPool,
} from '@votingworks/hmpb';
import {
  BallotStyle,
  ballotPaperDimensions,
  BallotType,
  Election,
  ElectionPackageFileName,
  EncodedBallotEntry,
  formatElectionHashes,
  getBallotLanguageConfigs,
  HmpbBallotPaperSize,
  LanguageCode,
  LATEST_METADATA,
  LATEST_SOFTWARE_VERSION,
  mergeUiStrings,
  SoftwareVersion,
  Precinct,
  safeParse,
  UiStringsPackage,
} from '@votingworks/types';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { buffer } from 'node:stream/consumers';
import * as tmp from 'tmp';
import { createBallotPropsForTemplate } from '../ballots.js';
import { CircleCiClient } from '../circleci_client.js';
import { S3FileStorageClient } from '../file_storage_client.js';
import { QaConfig } from '../qa_config.js';
import { normalizeBallotColorModeForPrinting } from '../worker/ballot_pdfs.js';
import { stateDefaultSystemSettings } from '../system_settings.js';
import { Archiver } from '../worker/zip.js';
import {
  convertNhElection,
  NhBallotStyle,
  NhBallotStyleSchema,
} from './convert_nh_election.js';

const USAGE = `Usage: nh-ballot-production --handcount|--vx --signature <signature.svg> --out <output-dir> [--qa] <input-dir>`;

const PROOF_WATERMARK = 'PROOF';

const QA_PACKAGE_FILE_NAME = 'election-package.zip';
const QA_KEY_PREFIX = 'nh-qa';
const QA_PRESIGN_EXPIRY_SECONDS = 12 * 60 * 60;
const QA_TRIGGER_DELAY_MS = 1500;

type BallotCategory = 'absentee' | 'foo' | 'precinct' | 'sample' | 'uocava';

type TabulationMode = 'handcount' | 'vx';

interface SourceFile {
  path: string;
  name: string;
  nhBallotStyle: NhBallotStyle;
}

interface Jurisdiction {
  name: string;
  files: SourceFile[];
}

/**
 * Corrections NH hasn't made to the source files, layered in here instead.
 * Keyed by the source file's spelling.
 */
const TOWN_NAME_CORRECTIONS: Readonly<Record<string, string>> = {
  'AT.& GIL. AC. GT.': 'AT. & GIL. AC. GT.',
  'CHANDLERS PURCHASE': "CHANDLER'S PURCHASE",
  'LOW & BURBANKS GRANT': "LOW & BURBANK'S GRANT",
};

function correctTownName(townName: string): string {
  return TOWN_NAME_CORRECTIONS[townName] ?? townName;
}

// Exported file names keep NH's spelling so they stay matched to the source
// files, apart from the same missing space.
function correctFileName(fileName: string): string {
  return fileName.replace('AT.&', 'AT. &');
}

function ballotCategory(props: NhStateBallotProps): BallotCategory | undefined {
  if (props.variant === 'federalOfficeOnly') {
    return 'foo';
  }
  if (props.variant === 'uocava') {
    return 'uocava';
  }
  if (props.ballotType !== BallotType.Precinct) {
    return props.ballotMode === 'official' ? 'absentee' : undefined;
  }
  switch (props.ballotMode) {
    case 'official':
      return 'precinct';
    case 'sample':
      return 'sample';
    default:
      return undefined;
  }
}

function fileNameWithPaperLength(
  name: string,
  paperSize: HmpbBallotPaperSize
): string {
  return `${name} ${ballotPaperDimensions(paperSize).height}in`;
}

function precinctKeyForWard(wardName: string | number): string {
  const ward = String(wardName).trim();
  return ward ? `ward ${ward.toLowerCase()}` : 'town';
}

function precinctKeyForPrecinct(precinct: Precinct): string {
  const match = /^ward\s+(.+)$/i.exec(precinct.name.trim());
  return match
    ? `ward ${assertDefined(match[1]).trim().toLowerCase()}`
    : 'town';
}

function groupIntoJurisdictions(files: SourceFile[]): Jurisdiction[] {
  const byTown = new Map<string, SourceFile[]>();
  for (const file of files) {
    const town = file.nhBallotStyle.AVSInterface.HeaderInfo.TownName.trim();
    byTown.set(town, [...(byTown.get(town) ?? []), file]);
  }
  return [...byTown.entries()]
    .map(([name, townFiles]) => ({
      name,
      files: [...townFiles].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function fileNamesByPrecinctId(
  election: Election,
  files: SourceFile[]
): Map<string, string> {
  const namesByKey = new Map(
    files.map((file) => [
      precinctKeyForWard(file.nhBallotStyle.AVSInterface.HeaderInfo.WardName),
      file.name,
    ])
  );
  return new Map(
    election.precincts.map((precinct) => {
      const key = precinctKeyForPrecinct(precinct);
      const name = namesByKey.get(key);
      assert(
        name !== undefined,
        `No source file matches precinct '${precinct.name}' (looked for '${key}')`
      );
      return [precinct.id, name];
    })
  );
}

function englishOnlyTranslator(): GoogleCloudTranslator {
  return new GoogleCloudTranslator({
    translationClient: {
      translateText() {
        throw new Error(
          'nh-ballot-production builds English-only packages; translation is unavailable'
        );
      },
    },
  });
}

async function electionWithBallotStrings(election: Election): Promise<{
  election: Election;
  appStrings: UiStringsPackage;
}> {
  const ballotLanguageConfigs = getBallotLanguageConfigs([
    LanguageCode.ENGLISH,
  ]);
  const [appStrings, hmpbStrings, electionStrings] =
    await getAllStringsForElectionPackage(
      election,
      englishOnlyTranslator(),
      hmpbStringsCatalog,
      ballotLanguageConfigs
    );
  return {
    election: {
      ...election,
      ballotStrings: mergeUiStrings(electionStrings, hmpbStrings),
    },
    appStrings,
  };
}

async function renderRovFormAtFittingPaperSize(
  renderer: Renderer,
  props: Omit<Parameters<typeof renderNhStateRovForm>[1], 'paperSize'>,
  startingPaperSize: HmpbBallotPaperSize
): Promise<{ pdf: Uint8Array; paperSize: HmpbBallotPaperSize }> {
  const sizes = Object.values(HmpbBallotPaperSize);
  const startIndex = sizes.indexOf(startingPaperSize);
  const candidates = sizes.slice(startIndex === -1 ? 0 : startIndex);

  let lastError: unknown;
  for (const paperSize of candidates) {
    try {
      const document = await renderNhStateRovForm(renderer, {
        ...props,
        paperSize,
      });
      return { pdf: await document.renderToPdf(), paperSize };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function writeRovForms(
  rendererPool: RendererPool,
  p: {
    election: Election;
    fileNames: Map<string, string>;
    outDir: string;
  }
): Promise<void> {
  const rovDir = join(p.outDir, 'rovs');
  await mkdir(rovDir, { recursive: true });

  await rendererPool.runTasks(
    p.election.ballotStyles.map(
      (ballotStyle: BallotStyle) => async (renderer) => {
        const precinctId = assertDefined(ballotStyle.precincts[0]);
        const { pdf, paperSize } = await renderRovFormAtFittingPaperSize(
          renderer,
          { election: p.election, ballotStyle, precinctId },
          p.election.ballotLayout.paperSize
        );
        const fileName = fileNameWithPaperLength(
          assertDefined(p.fileNames.get(precinctId)),
          paperSize
        );
        await writeFile(join(rovDir, `${fileName}.pdf`), pdf);
        if (paperSize !== p.election.ballotLayout.paperSize) {
          process.stdout.write(
            `    ROV ${fileName}: using ${paperSize} (ballot is ${p.election.ballotLayout.paperSize})\n`
          );
        }
      }
    )
  );
}

async function writeElectionPackage(p: {
  jurisdictionName: string;
  electionData: string;
  ballotHash: string;
  appStrings: UiStringsPackage;
  encodedBallots: string;
  outDir: string;
}): Promise<string> {
  const zip = new Archiver();
  zip.addEntry(JSON.stringify(LATEST_METADATA, null, 2), {
    name: ElectionPackageFileName.METADATA,
  });
  zip.addEntry(p.electionData, { name: ElectionPackageFileName.ELECTION });
  zip.addEntry(JSON.stringify(stateDefaultSystemSettings.NH, null, 2), {
    name: ElectionPackageFileName.SYSTEM_SETTINGS,
  });
  zip.addEntry(JSON.stringify(p.appStrings, null, 2), {
    name: ElectionPackageFileName.APP_STRINGS,
  });
  zip.addEntry(p.encodedBallots, { name: ElectionPackageFileName.BALLOTS });
  zip.addEntry(JSON.stringify({}, null, 2), {
    name: ElectionPackageFileName.REGISTERED_VOTER_COUNTS,
  });

  const contents = await buffer(zip.finalize());
  const electionPackageHash = createHash('sha256')
    .update(contents)
    .digest('hex');
  const packageDir = join(p.outDir, 'election-packages');
  await mkdir(packageDir, { recursive: true });
  const hashes = formatElectionHashes(p.ballotHash, electionPackageHash);
  const path = join(packageDir, `${p.jurisdictionName}-${hashes}.zip`);
  await writeFile(path, contents);
  return path;
}

const PAGES_PER_SHEET = 2;

async function choosePaperSize(
  rendererPool: RendererPool,
  election: Election,
  isHandCount: boolean
): Promise<HmpbBallotPaperSize> {
  const sizes = Object.values(HmpbBallotPaperSize);
  const candidates = sizes.slice(sizes.indexOf(HmpbBallotPaperSize.Legal));

  for (const paperSize of candidates) {
    const sizedElection = withPaperSize(election, paperSize);
    const pageCounts = await rendererPool.runTasks(
      sizedElection.ballotStyles.map((ballotStyle) => async (renderer) => {
        const document = (
          await renderBallotTemplate(renderer, ballotTemplates.NhStateBallot, {
            election: sizedElection,
            ballotStyleId: ballotStyle.id,
            precinctId: assertDefined(ballotStyle.precincts[0]),
            ballotType: BallotType.Precinct,
            ballotMode: 'official' as const,
            ...(isHandCount ? { isHandCount: true } : {}),
          })
        ).unsafeUnwrap();
        return await countBallotPages(document);
      })
    );
    if (pageCounts.every((pages) => pages <= PAGES_PER_SHEET)) {
      return paperSize;
    }
  }

  throw new Error(
    `No supported paper size fits this ballot on a single sheet (tried ${candidates.join(
      ', '
    )})`
  );
}

function withPaperSize(
  election: Election,
  paperSize: HmpbBallotPaperSize
): Election {
  return { ...election, ballotLayout: { ...election.ballotLayout, paperSize } };
}

async function normalizeForPrinting(
  ballotPath: string,
  election: Election
): Promise<void> {
  if (election.type === 'primary') {
    await normalizeBallotColorModeForPrinting({
      ballotPath,
      ballotTemplateId: 'NhStateBallot',
    });
    return;
  }
  await convertPdfFileToGrayscale(ballotPath);
}

async function writeProofBallots(
  rendererPool: RendererPool,
  p: {
    election: Election;
    ballotProps: NhStateBallotProps[];
    fileNames: Map<string, string>;
    outDir: string;
    scratchDir: ScratchDir;
  }
): Promise<void> {
  const proofDir = join(p.outDir, 'ballots', 'proof');
  await mkdir(proofDir, { recursive: true });

  await rendererPool.runTasks(
    p.ballotProps
      .filter((props) => ballotCategory(props) === 'precinct')
      .map((props) => async (renderer: Renderer) => {
        const document = (
          await renderBallotTemplate(renderer, ballotTemplates.NhStateBallot, {
            ...props,
            watermark: PROOF_WATERMARK,
          })
        ).unsafeUnwrap();
        const fileName = fileNameWithPaperLength(
          assertDefined(p.fileNames.get(props.precinctId)),
          p.election.ballotLayout.paperSize
        );
        const scratchPath = join(p.scratchDir.path, `${randomUUID()}.pdf`);
        await writeFile(scratchPath, await document.renderToPdf());
        await normalizeForPrinting(scratchPath, p.election);
        await copyFile(scratchPath, join(proofDir, `${fileName}.pdf`));
      })
  );
}

async function triggerQa(p: {
  config: QaConfig;
  jurisdictionName: string;
  packagePath: string;
  vxsuiteVersion: SoftwareVersion;
}): Promise<void> {
  const storageKey = `${QA_KEY_PREFIX}/${randomUUID()}/${QA_PACKAGE_FILE_NAME}`;
  const fileStorageClient = new S3FileStorageClient();
  await fileStorageClient.streamFile(
    storageKey,
    createReadStream(p.packagePath)
  );
  const exportPackageUrl = await fileStorageClient.getSignedUrl(
    storageKey,
    QA_PRESIGN_EXPIRY_SECONDS
  );

  const { pipelineNumber } = await new CircleCiClient(p.config).triggerPipeline(
    {
      exportPackageUrl,
      webhookUrl: '',
      qaRunId: randomUUID(),
      electionId: p.jurisdictionName,
      vxsuiteVersion: p.vxsuiteVersion,
    }
  );
  process.stdout.write(
    `    VxQA pipeline ${pipelineNumber}: https://app.circleci.com/pipelines/${p.config.projectSlug}/${pipelineNumber}\n`
  );
}

async function processJurisdiction(
  rendererPool: RendererPool,
  jurisdiction: Jurisdiction,
  p: {
    mode: TabulationMode;
    signatureImage: string;
    outDir: string;
    qaConfig?: QaConfig;
  }
): Promise<void> {
  const isHandCount = p.mode === 'handcount';
  const converted = convertNhElection(
    jurisdiction.files.map((file) => file.nhBallotStyle),
    p.signatureImage
  );
  const { election: withStrings, appStrings } =
    await electionWithBallotStrings(converted);
  const paperSize = await choosePaperSize(
    rendererPool,
    withStrings,
    isHandCount
  );
  if (paperSize !== HmpbBallotPaperSize.Legal) {
    process.stdout.write(`    ballots: using ${paperSize}\n`);
  }
  const election = withPaperSize(withStrings, paperSize);
  const fileNames = fileNamesByPrecinctId(election, jurisdiction.files);

  const allProps = createBallotPropsForTemplate(
    'NhStateBallot',
    election,
    false
  ) as NhStateBallotProps[];
  const ballotProps = allProps
    .filter((props) => ballotCategory(props) !== undefined)
    .map((props) => (isHandCount ? { ...props, isHandCount: true } : props));

  const serializationOptions: ElectionSerializationOptions = {
    format: 'vxf',
    version: isHandCount ? LATEST_SOFTWARE_VERSION : 'v4.0',
  };

  const scratchDir: ScratchDir = {
    path: tmp.dirSync({ unsafeCleanup: true }).name,
  };
  const { ballotPaths, electionDefinition } =
    await renderAllBallotPdfsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates.NhStateBallot,
      ballotProps,
      serializationOptions,
      scratchDir
    );

  await Promise.all(
    ballotPaths.map((ballotPath) => normalizeForPrinting(ballotPath, election))
  );

  const encodedBallotLines: string[] = [];
  for (const [props, ballotPath] of iter(ballotProps).zip(ballotPaths)) {
    const category = assertDefined(ballotCategory(props));
    const categoryDir = join(p.outDir, 'ballots', category);
    await mkdir(categoryDir, { recursive: true });
    const fileName = fileNameWithPaperLength(
      assertDefined(fileNames.get(props.precinctId)),
      election.ballotLayout.paperSize
    );
    await copyFile(ballotPath, join(categoryDir, `${fileName}.pdf`));

    if (props.variant === undefined && props.ballotMode === 'official') {
      const entry: EncodedBallotEntry = {
        ballotStyleId: props.ballotStyleId,
        precinctId: props.precinctId,
        ballotType: props.ballotType,
        ballotMode: props.ballotMode,
        watermark: props.watermark,
        compact: false,
        ballotAuditId: props.ballotAuditId,
        encodedBallot: await readFile(ballotPath, 'base64'),
      };
      encodedBallotLines.push(`${JSON.stringify(entry)}\n`);
    }
  }

  await writeProofBallots(rendererPool, {
    election,
    ballotProps,
    fileNames,
    outDir: p.outDir,
    scratchDir,
  });

  await writeRovForms(rendererPool, {
    election,
    fileNames,
    outDir: p.outDir,
  });

  if (!isHandCount) {
    const packagePath = await writeElectionPackage({
      jurisdictionName: jurisdiction.name,
      electionData: electionDefinition.electionData,
      ballotHash: electionDefinition.ballotHash,
      appStrings,
      encodedBallots: encodedBallotLines.join(''),
      outDir: p.outDir,
    });

    if (p.qaConfig) {
      await triggerQa({
        config: p.qaConfig,
        jurisdictionName: jurisdiction.name,
        packagePath,
        vxsuiteVersion: assertDefined(serializationOptions.version),
      });
      await sleep(QA_TRIGGER_DELAY_MS);
    }
  }
}

async function readSourceFiles(inputDir: string): Promise<SourceFile[]> {
  const entries = (await readdir(inputDir)).filter(
    (entry) => extname(entry).toLowerCase() === '.json'
  );
  return await Promise.all(
    [...entries].sort().map(async (entry) => {
      const path = join(inputDir, entry);
      const nhBallotStyle = safeParse<NhBallotStyle>(
        NhBallotStyleSchema,
        JSON.parse(await readFile(path, 'utf-8'))
      ).unsafeUnwrap();
      const headerInfo = nhBallotStyle.AVSInterface.HeaderInfo;
      headerInfo.TownName = correctTownName(headerInfo.TownName);
      return {
        path,
        name: correctFileName(basename(entry, extname(entry))),
        nhBallotStyle,
      };
    })
  );
}

interface Args {
  mode: TabulationMode;
  signaturePath: string;
  outDir: string;
  inputDir: string;
  qa: boolean;
}

function parseArgs(args: readonly string[]): Args | undefined {
  const rest: string[] = [];
  let mode: TabulationMode | undefined;
  let signaturePath: string | undefined;
  let outDir: string | undefined;
  let qa = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--handcount':
        mode = 'handcount';
        break;
      case '--vx':
        mode = 'vx';
        break;
      case '--qa':
        qa = true;
        break;
      case '--signature':
        i += 1;
        signaturePath = args[i];
        break;
      case '--out':
        i += 1;
        outDir = args[i];
        break;
      default:
        rest.push(assertDefined(arg));
    }
  }

  const inputDir = rest[0];
  if (!mode || !signaturePath || !outDir || !inputDir || rest.length > 1) {
    return undefined;
  }
  return { mode, signaturePath, outDir, inputDir, qa };
}

export async function main(args: readonly string[]): Promise<number> {
  const parsed = parseArgs(args);
  if (!parsed) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
  }

  const qaConfig = parsed.qa
    ? assertDefined(
        QaConfig.fromEnv(),
        'Automated QA is not configured. Set CIRCLECI_API_TOKEN, CIRCLECI_PROJECT_SLUG and CIRCLECI_WEBHOOK_SECRET (plus AWS_S3_BUCKET_NAME, AWS_S3_REGION and AWS credentials) to use --qa.'
      )
    : undefined;
  if (parsed.qa && parsed.mode === 'handcount') {
    process.stderr.write(
      'Hand-count towns have no election package to QA; --qa has no effect.\n'
    );
  }

  const signatureImage = await readFile(parsed.signaturePath, 'utf-8');
  const files = await readSourceFiles(parsed.inputDir);
  const jurisdictions = groupIntoJurisdictions(files);
  process.stdout.write(
    `Found ${files.length} ballot style files in ${jurisdictions.length} jurisdictions\n`
  );

  const rendererPool = await createPlaywrightRendererPool();
  try {
    for (const [i, jurisdiction] of jurisdictions.entries()) {
      process.stdout.write(
        `[${i + 1}/${jurisdictions.length}] ${jurisdiction.name} (${
          jurisdiction.files.length
        } file(s))\n`
      );
      await processJurisdiction(rendererPool, jurisdiction, {
        mode: parsed.mode,
        signatureImage,
        outDir: parsed.outDir,
        qaConfig,
      });
    }
  } finally {
    await rendererPool.close();
  }

  return 0;
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
