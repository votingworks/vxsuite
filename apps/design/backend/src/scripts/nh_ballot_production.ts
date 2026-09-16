import { assert, assertDefined, iter } from '@votingworks/basics';
import {
  getAllStringsForElectionPackage,
  GoogleCloudTranslator,
} from '@votingworks/backend';
import {
  ballotTemplates,
  createPlaywrightRendererPool,
  hmpbStringsCatalog,
  countBallotPages,
  ElectionSerializationOptions,
  NhStateBallotProps,
  renderAllBallotPdfsAndCreateElectionDefinition,
  renderBallotTemplate,
  renderNhStateRovForm,
  Renderer,
  RendererPool,
} from '@votingworks/hmpb';
import {
  BallotStyle,
  BallotType,
  Election,
  ElectionPackageFileName,
  formatElectionHashes,
  getBallotLanguageConfigs,
  HmpbBallotPaperSize,
  LanguageCode,
  LATEST_METADATA,
  LATEST_SOFTWARE_VERSION,
  mergeUiStrings,
  Precinct,
  safeParse,
  UiStringsPackage,
} from '@votingworks/types';
import { createHash } from 'node:crypto';
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
import { stateDefaultSystemSettings } from '../system_settings.js';
import { Archiver } from '../worker/zip.js';
import {
  convertNhElection,
  NhBallotStyle,
  NhBallotStyleSchema,
} from './convert_nh_election.js';

const USAGE = `Usage: nh-ballot-production --handcount|--vx --signature <signature.svg> --out <output-dir> <input-dir>`;

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

/**
 * NH ballots are English-only, so every string resolves from the local
 * catalogs. This translator fails loudly rather than reaching the network if
 * that ever stops being true.
 */
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

/**
 * ROV forms list every contest on one sheet, so they often need more paper than
 * the ballot itself. Start at the ballot's size and step up until one fits.
 */
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
        const fileName = assertDefined(p.fileNames.get(precinctId));
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

/**
 * NH prints on legal stock, disregarding the size named in the source files.
 * A ballot that would spill onto a second sheet moves up to the next size
 * instead, since every voter's ballot has to be a single sheet.
 */
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

async function processJurisdiction(
  rendererPool: RendererPool,
  jurisdiction: Jurisdiction,
  p: {
    mode: TabulationMode;
    signatureImage: string;
    outDir: string;
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

  // Hand-count ballots are never scanned, so they have no bubble positions to
  // express in the v4.0 grid layout format.
  const serializationOptions: ElectionSerializationOptions = {
    format: 'vxf',
    version: isHandCount ? LATEST_SOFTWARE_VERSION : 'v4.0',
  };

  const { ballotPaths, electionDefinition } =
    await renderAllBallotPdfsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates.NhStateBallot,
      ballotProps,
      serializationOptions,
      { path: tmp.dirSync({ unsafeCleanup: true }).name }
    );

  for (const [props, ballotPath] of iter(ballotProps).zip(ballotPaths)) {
    const category = assertDefined(ballotCategory(props));
    const categoryDir = join(p.outDir, 'ballots', category);
    await mkdir(categoryDir, { recursive: true });
    const fileName = assertDefined(fileNames.get(props.precinctId));
    await copyFile(ballotPath, join(categoryDir, `${fileName}.pdf`));
  }

  await writeRovForms(rendererPool, {
    election,
    fileNames,
    outDir: p.outDir,
  });

  if (!isHandCount) {
    await writeElectionPackage({
      jurisdictionName: jurisdiction.name,
      electionData: electionDefinition.electionData,
      ballotHash: electionDefinition.ballotHash,
      appStrings,
      outDir: p.outDir,
    });
  }
}

async function readSourceFiles(inputDir: string): Promise<SourceFile[]> {
  const entries = (await readdir(inputDir)).filter(
    (entry) => extname(entry).toLowerCase() === '.json'
  );
  return await Promise.all(
    [...entries].sort().map(async (entry) => {
      const path = join(inputDir, entry);
      return {
        path,
        name: basename(entry, extname(entry)),
        nhBallotStyle: safeParse<NhBallotStyle>(
          NhBallotStyleSchema,
          JSON.parse(await readFile(path, 'utf-8'))
        ).unsafeUnwrap(),
      };
    })
  );
}

interface Args {
  mode: TabulationMode;
  signaturePath: string;
  outDir: string;
  inputDir: string;
}

function parseArgs(args: readonly string[]): Args | undefined {
  const rest: string[] = [];
  let mode: TabulationMode | undefined;
  let signaturePath: string | undefined;
  let outDir: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--handcount':
        mode = 'handcount';
        break;
      case '--vx':
        mode = 'vx';
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
  return { mode, signaturePath, outDir, inputDir };
}

export async function main(args: readonly string[]): Promise<number> {
  const parsed = parseArgs(args);
  if (!parsed) {
    process.stderr.write(`${USAGE}\n`);
    return 1;
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
