import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import {
  type BallotLanguageConfigs,
  BallotType,
  type BaseBallotProps,
  type Election,
  type ElectionDefinition,
  type ElectionDefinitionWithData,
  ElectionPackageFileName,
  type ElectionPackageMetadata,
  type ElectionRegisteredVoterCounts,
  type ElectionRegisteredVoterCountTotals,
  toTotalRegisteredVoterCounts,
  type ElectionSerializationFormat,
  type EncodedBallotEntry,
  formatBallotHash,
  formatElectionHashes,
  type GetCandidateOrderingsFn,
  LATEST_METADATA,
  mergeUiStrings,
  type SoftwareVersion,
  type SystemSettings,
  type TtsEditEntry,
} from '@votingworks/types';
import {
  ballotTemplates,
  type BallotTemplateId,
  createBallotPropsForTemplate,
  type ElectionSerializationOptions,
  getBallotPdfFileName,
  hmpbStringsCatalog,
  randomScratchFilePath,
  renderAllBallotPdfsAndCreateElectionDefinition,
  type RendererPool,
  type ScratchDir,
} from '@votingworks/hmpb';
import {
  generateAudioIdsAndClips,
  getAllStringsForElectionPackage,
  HashingPassthrough,
  type SpeechSynthesizer,
  type Translator,
} from '@votingworks/backend';
import { find, iter, range, throwIllegalValue } from '@votingworks/basics';
import {
  needsColorNormalization,
  normalizeBallotColorModeForPrinting,
  renderCalibrationSheetPdf,
} from './ballot_pdfs.js';
import {
  addPollingPlacesForExport,
  formatElectionForExport,
} from './election_export.js';
import type { FileStorageClient } from './file_storage_client.js';
import type { StateCode } from '../state_features.js';
import { Archiver } from './zip.js';

export type EmitProgressFunction = (
  label: string,
  progress: number,
  total: number
) => void;

export interface ElectionPackageAndBallotsInput {
  election: Election;
  stateCode: StateCode;
  ballotLanguageConfigs: BallotLanguageConfigs;
  ballotTemplateId: BallotTemplateId;
  getCandidateOrderings: GetCandidateOrderingsFn;
  compact: boolean;
  systemSettings: SystemSettings;
  registeredVoterCounts: ElectionRegisteredVoterCounts;
  softwareVersion: SoftwareVersion;
  electionSerializationFormat: ElectionSerializationFormat;
  audio?: {
    speechSynthesizer: SpeechSynthesizer;
    electionTtsEdits: TtsEditEntry[];
  };
  shouldExportSampleBallots?: boolean;
  shouldExportTestBallots?: boolean;
  numAuditIdBallots?: number;
}

export interface ElectionPackageAndBallotsContext {
  translator: Translator;
  createRendererPool: () => Promise<RendererPool>;
  fileStorageClient: FileStorageClient;
  outputDirectory: string;
  scratchDir: ScratchDir;
  emitProgress: EmitProgressFunction;
}

/**
 * Where the election package and ballot zips were written, as paths relative
 * to the file storage client's root.
 */
export interface ElectionPackageAndBallotsOutput {
  electionDefinition: ElectionDefinitionWithData;
  electionPackagePath: string;
  officialBallotsPath: string;
  sampleBallotsPath?: string;
  testBallotsPath?: string;
}

function serializeRegisteredVoterCounts(
  counts: ElectionRegisteredVoterCounts,
  version: SoftwareVersion
): ElectionRegisteredVoterCounts | ElectionRegisteredVoterCountTotals {
  switch (version) {
    case 'v4.0':
      return toTotalRegisteredVoterCounts(counts);
    case 'v4.1':
      return counts;
    default:
      return throwIllegalValue(version);
  }
}

function generateEncodedBallots(p: {
  ballotProps: BaseBallotProps[];
  ballotPaths: string[];
}): Readable {
  return Readable.from(
    (async function* generateJsonLines() {
      for (const [props, path] of iter(p.ballotProps).zip(p.ballotPaths)) {
        const encodedBallot: EncodedBallotEntry = {
          ballotStyleId: props.ballotStyle.id,
          precinctId: props.precinctId,
          ballotType: props.ballotType,
          ballotMode: props.ballotMode,
          watermark: props.watermark,
          compact: props.compact,
          ballotAuditId: props.ballotAuditId,
          encodedBallot: await fs.readFile(path, 'base64'),
        };
        yield `${JSON.stringify(encodedBallot)}\n`;
      }
    })()
  );
}

/**
 * Renders every ballot for an election and writes the election package and the
 * official, sample and test ballot zips to file storage.
 */
export async function renderElectionPackageAndBallots(
  ctx: ElectionPackageAndBallotsContext,
  input: ElectionPackageAndBallotsInput
): Promise<ElectionPackageAndBallotsOutput> {
  const rendererPool = await ctx.createRendererPool();
  try {
    return await generate(ctx, input, rendererPool);
  } finally {
    // eslint-disable-next-line no-console
    rendererPool.close().catch(console.error);
  }
}

async function generate(
  ctx: ElectionPackageAndBallotsContext,
  input: ElectionPackageAndBallotsInput,
  rendererPool: RendererPool
): Promise<ElectionPackageAndBallotsOutput> {
  const { translator, emitProgress, scratchDir } = ctx;
  const {
    ballotLanguageConfigs,
    ballotTemplateId,
    compact,
    electionSerializationFormat,
    audio,
    shouldExportSampleBallots,
    shouldExportTestBallots,
    numAuditIdBallots,
  } = input;
  let { systemSettings } = input;

  const officialBallotsZip = new Archiver();
  const sampleBallotsZip = new Archiver();
  const testBallotsZip = new Archiver();
  const electionPackageZip = new Archiver();

  // Make election package
  const metadata: ElectionPackageMetadata = LATEST_METADATA;
  electionPackageZip.addEntry(JSON.stringify(metadata, null, 2), {
    name: ElectionPackageFileName.METADATA,
  });

  const election = addPollingPlacesForExport(
    input.election,
    { stateCode: input.stateCode },
    systemSettings
  );

  const [appStrings, hmpbStrings, electionStrings] =
    await getAllStringsForElectionPackage(
      election,
      translator,
      hmpbStringsCatalog,
      ballotLanguageConfigs,
      {
        shouldTransliterateCandidateNames:
          systemSettings.shouldTransliterateCandidateNames,
      }
    );

  electionPackageZip.addEntry(JSON.stringify(appStrings, null, 2), {
    name: ElectionPackageFileName.APP_STRINGS,
  });
  const ballotStrings = mergeUiStrings(electionStrings, hmpbStrings);

  const formattedElection = formatElectionForExport(election, ballotStrings);

  let allBallotProps = createBallotPropsForTemplate(
    ballotTemplateId,
    formattedElection,
    compact
  );
  // eslint-disable-next-line array-callback-return
  allBallotProps = allBallotProps.filter(({ ballotMode }) => {
    switch (ballotMode) {
      case 'official':
        return true;

      case 'sample':
        return shouldExportSampleBallots;

      case 'test':
        return shouldExportTestBallots;

      default: {
        throwIllegalValue(ballotMode);
      }
    }
  });

  // If we're exporting ballots with ballot audit IDs...
  if (numAuditIdBallots) {
    // Turn on the system setting so VxScan knows to expect ballot audit IDs.
    systemSettings = {
      ...input.systemSettings,
      precinctScanEnableBallotAuditIds: true,
    };

    // Instead of generating one of each combo of ballot style/precinct/ballot
    // type/ballot mode, just pick one and generate a ballot PDF for each audit
    // ballot ID. For now, we're just testing this feature, so we don't need
    // every combo.
    const officialPrecinctBallotProps = find(
      allBallotProps,
      (props) =>
        props.ballotMode === 'official' &&
        props.ballotType === BallotType.Precinct
    );
    allBallotProps = range(1, numAuditIdBallots + 1).map((ballotIndex) => ({
      ...officialPrecinctBallotProps,
      ballotAuditId: String(ballotIndex),
    }));
  }

  const serializationOptions: ElectionSerializationOptions = {
    compact: systemSettings.splitElectionDefinition,
    format: electionSerializationFormat,
    version: input.softwareVersion,
  };

  const {
    electionDefinition,
    ballotPaths,
    ballotPositionsPath,
    candidateOrderingsPath,
  } = await renderAllBallotPdfsAndCreateElectionDefinition(
    rendererPool,
    ballotTemplates[ballotTemplateId],
    allBallotProps,
    input.getCandidateOrderings,
    serializationOptions,
    systemSettings,
    scratchDir,
    emitProgress
  );

  const calibrationSheetPdf = await rendererPool.runTask((renderer) =>
    renderCalibrationSheetPdf(renderer, election.ballotLayout.paperSize)
  );

  // Close renderer pool early to free up memory for remaining tasks.
  // eslint-disable-next-line no-console
  await rendererPool.close().catch(console.error);

  electionPackageZip.addEntry(electionDefinition.electionData, {
    compress: systemSettings.splitElectionDefinition,
    name: ElectionPackageFileName.ELECTION,
  });

  if (ballotPositionsPath) {
    electionPackageZip.addEntryFromPath(ballotPositionsPath, {
      compress: true,
      name: ElectionPackageFileName.BALLOT_POSITIONS,
    });
  }

  if (candidateOrderingsPath) {
    electionPackageZip.addEntryFromPath(candidateOrderingsPath, {
      compress: true,
      name: ElectionPackageFileName.CANDIDATE_ORDERINGS,
    });
  }

  electionPackageZip.addEntry(JSON.stringify(systemSettings, null, 2), {
    name: ElectionPackageFileName.SYSTEM_SETTINGS,
  });

  const registeredVoterCounts = serializeRegisteredVoterCounts(
    input.registeredVoterCounts,
    input.softwareVersion
  );
  electionPackageZip.addEntry(JSON.stringify(registeredVoterCounts, null, 2), {
    name: ElectionPackageFileName.REGISTERED_VOTER_COUNTS,
  });

  if (audio) {
    const { uiStringAudioIds, uiStringAudioClips } = generateAudioIdsAndClips({
      appStrings,
      electionStrings,
      electionTtsEdits: audio.electionTtsEdits,
      speechSynthesizer: audio.speechSynthesizer,
      emitProgress: (progress, total) =>
        emitProgress('Generating audio', progress, total),
    });
    electionPackageZip.addEntry(JSON.stringify(uiStringAudioIds, null, 2), {
      name: ElectionPackageFileName.AUDIO_IDS,
    });
    electionPackageZip.addEntry(uiStringAudioClips, {
      compress: systemSettings.splitElectionDefinition,
      name: ElectionPackageFileName.AUDIO_CLIPS,
    });
  }

  await normalizeBallots({ ballotPaths, ballotTemplateId });

  const encodedBallots = generateEncodedBallots({
    ballotProps: allBallotProps,
    ballotPaths,
  });
  electionPackageZip.addEntry(encodedBallots, {
    compress: systemSettings.splitElectionDefinition,
    name: ElectionPackageFileName.BALLOTS,
  });

  // Add ballots to ZIP files, grouped by ballot type:
  for (const [props, ballotPath] of iter(allBallotProps).zip(ballotPaths)) {
    const fileName = getBallotPdfFileName(props);
    const { ballotMode } = props;

    switch (ballotMode) {
      case 'official':
        officialBallotsZip.addEntryFromPath(ballotPath, { name: fileName });
        break;

      case 'sample':
        sampleBallotsZip.addEntryFromPath(ballotPath, { name: fileName });
        break;

      case 'test':
        testBallotsZip.addEntryFromPath(ballotPath, { name: fileName });
        break;

      default: {
        throwIllegalValue(ballotMode);
      }
    }
  }

  const calibrationSheetFilename = 'VxScan-calibration-sheet.pdf';
  officialBallotsZip.addEntry(calibrationSheetPdf, {
    name: calibrationSheetFilename,
  });

  if (shouldExportTestBallots) {
    testBallotsZip.addEntry(calibrationSheetPdf, {
      name: calibrationSheetFilename,
    });
  }

  const ballotHash = formatBallotHash(electionDefinition.ballotHash);
  const [
    electionPackagePath,
    officialBallotsPath,
    sampleBallotsPath,
    testBallotsPath,
  ] = await Promise.all([
    writeElectionZip(ctx, electionDefinition, electionPackageZip),

    writeZipFile(
      ctx,
      officialBallotsZip.finalize(),
      `official-ballots-${ballotHash}.zip`
    ),

    shouldExportSampleBallots
      ? writeZipFile(
          ctx,
          sampleBallotsZip.finalize(),
          `sample-ballots-${ballotHash}.zip`
        )
      : undefined,

    shouldExportTestBallots
      ? writeZipFile(
          ctx,
          testBallotsZip.finalize(),
          `test-ballots-${ballotHash}.zip`
        )
      : undefined,
  ]);

  return {
    electionDefinition,
    electionPackagePath,
    officialBallotsPath,
    sampleBallotsPath,
    testBallotsPath,
  };
}

/**
 * Normalizes ballot PDF files, performing any color mode conversion necessary
 * for the specified ballot template.
 */
async function normalizeBallots(p: {
  ballotPaths: string[];
  ballotTemplateId: BallotTemplateId;
}) {
  if (!needsColorNormalization(p.ballotTemplateId)) return;

  const it = p.ballotPaths.values();

  async function worker() {
    while (true) {
      const next = it.next();
      if (next.done) return;

      await normalizeBallotColorModeForPrinting({
        ballotPath: next.value,
        ballotTemplateId: p.ballotTemplateId,
      });
    }
  }

  await Promise.all(Array.from({ length: os.availableParallelism() }, worker));
}

async function writeElectionZip(
  ctx: ElectionPackageAndBallotsContext,
  electionDefinition: ElectionDefinition,
  zip: Archiver
) {
  const scratchPath = randomScratchFilePath(ctx.scratchDir, {
    extension: 'zip',
  });

  const contentStream = zip.finalize();
  const hashingStream = new HashingPassthrough(createHash('sha256'));
  await pipeline(contentStream, hashingStream, createWriteStream(scratchPath));

  const electionPackageHash = hashingStream.digest('hex');
  const combinedHash = formatElectionHashes(
    electionDefinition.ballotHash,
    electionPackageHash
  );

  return writeZipFile(
    ctx,
    createReadStream(scratchPath),
    `election-package-${combinedHash}.zip`
  );
}

async function writeZipFile(
  ctx: ElectionPackageAndBallotsContext,
  contents: Readable,
  name: string
) {
  const relativePath = `${ctx.outputDirectory}/${name}`;
  await ctx.fileStorageClient.streamFile(relativePath, contents);
  return relativePath;
}
