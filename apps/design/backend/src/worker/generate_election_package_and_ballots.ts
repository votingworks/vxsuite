import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  ElectionSerializationFormat,
  ElectionPackageFileName,
  ElectionPackageMetadata,
  mergeUiStrings,
  formatElectionHashes,
  LATEST_METADATA,
  ElectionId,
  formatBallotHash,
  BallotType,
  ElectionIdSchema,
  ElectionSerializationFormatSchema,
  EncodedBallotEntry,
  BaseBallotProps,
  SoftwareVersion,
  ElectionDefinition,
} from '@votingworks/types';
import {
  hmpbStringsCatalog,
  ballotTemplates,
  renderAllBallotPdfsAndCreateElectionDefinition,
  createPlaywrightRendererPool,
  ElectionSerializationOptions,
  ScratchDir,
  RendererPool,
  BallotTemplateId,
  randomScratchFilePath,
} from '@votingworks/hmpb';
import {
  generateAudioIdsAndClips,
  getAllStringsForElectionPackage,
  HashingPassthrough,
} from '@votingworks/backend';
import {
  extractErrorMessage,
  find,
  iter,
  range,
  throwIllegalValue,
} from '@votingworks/basics';
import z from 'zod/v4';
import { Readable } from 'node:stream';
import { createHash, randomUUID as uuid } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { EmitProgressFunction, WorkerContext } from './context.js';
import {
  addPollingPlacesForExport,
  createBallotPropsForTemplate,
  formatElectionForExport,
} from '../ballots.js';
import { getBallotPdfFileName } from '../utils.js';
import {
  needsColorNormalization,
  normalizeBallotColorModeForPrinting,
  renderCalibrationSheetPdf,
} from './ballot_pdfs.js';
import { CircleCiClient } from '../circleci_client.js';
import { FileStorageClient } from '../file_storage_client.js';
import { baseUrl } from '../globals.js';
import { QaConfig } from '../qa_config.js';
import { Store } from '../store.js';
import { rootDebug } from '../debug.js';
import { Archiver } from './zip.js';

const debug = rootDebug.extend('export-qa');

export interface GenerateElectionPackageAndBallotsPayload {
  electionId: ElectionId;
  electionSerializationFormat: ElectionSerializationFormat;
  shouldExportAudio?: boolean;
  shouldExportSampleBallots?: boolean;
  shouldExportTestBallots?: boolean;
  numAuditIdBallots?: number;
}

export const GenerateElectionPackageAndBallotsPayloadSchema: z.ZodType<GenerateElectionPackageAndBallotsPayload> =
  z.object({
    electionId: ElectionIdSchema,
    electionSerializationFormat: ElectionSerializationFormatSchema,
    shouldExportAudio: z.boolean().optional(),
    shouldExportSampleBallots: z.boolean().optional(),
    shouldExportTestBallots: z.boolean().optional(),
    numAuditIdBallots: z.number().optional(),
  });

/**
 * Trigger a CircleCI QA build for the exported election package.
 * This is called after the export completes successfully.
 * If CircleCI is not enabled or if there's an error, it will log but not fail the export.
 */
async function triggerCircleCiQaBuild(params: {
  store: Store;
  electionId: ElectionId;
  electionPackageUrl: string;
  fileStorageClient: FileStorageClient;
  organizationId: string;
  vxsuiteVersion: SoftwareVersion;
}): Promise<void> {
  const {
    store,
    electionId,
    electionPackageUrl,
    fileStorageClient,
    organizationId,
    vxsuiteVersion,
  } = params;

  const config = QaConfig.fromEnv();
  if (!config?.isQaEnabledForOrganization(organizationId)) {
    debug(
      'Automated QA is either not configured or not enabled for this organization: organizationId=%s',
      organizationId
    );
    return;
  }

  // @coverage-defer
  const qaRunId = uuid();

  // Use a presigned S3 URL if available (production), otherwise fall back to
  // the app URL (dev/test where files are on the local filesystem)
  let fullExportUrl: string;
  // @coverage-defer
  if (fileStorageClient.getSignedUrl) {
    const storageKey = electionPackageUrl.replace(/^\/files\//, '');
    fullExportUrl = await fileStorageClient.getSignedUrl(storageKey);
    debug(
      'Using presigned S3 URL for export package: electionId=%s',
      electionId
    );
  } else {
    fullExportUrl = new URL(electionPackageUrl, baseUrl()).toString();
    debug(
      'Using app URL for export package: electionId=%s, url=%s',
      electionId,
      fullExportUrl
    );
  }

  // @coverage-defer
  // Construct the webhook URL
  const webhookUrl = new URL(
    `/api/export-qa-webhook/${qaRunId}`,
    baseUrl()
  ).toString();

  // @coverage-defer
  // Create QA run record
  await store.createExportQaRun({
    id: qaRunId,
    electionId,
    exportPackageUrl: fullExportUrl,
  });

  // @coverage-defer
  try {
    // Trigger CircleCI pipeline
    const circleCiClient = new CircleCiClient(config);
    const result = await circleCiClient.triggerPipeline({
      exportPackageUrl: fullExportUrl,
      webhookUrl,
      qaRunId,
      electionId,
      vxsuiteVersion,
    });

    // Update QA run with CircleCI pipeline ID and job URL
    await store.updateExportQaRunStatus(qaRunId, {
      status: 'in_progress',
      statusMessage: 'Waiting for CI job to start',
      circleCiWorkflowId: result.pipelineId,
      jobUrl: circleCiClient.pipelineUrl(result.pipelineNumber),
    });

    debug(
      'CircleCI QA build triggered successfully: electionId=%s, qaRunId=%s, pipelineId=%s',
      electionId,
      qaRunId,
      result.pipelineId
    );
  } catch (error) {
    const message = extractErrorMessage(error);

    // Log the error but don't fail the export
    debug(
      'Error triggering CircleCI QA build: error=%s, electionId=%s',
      message,
      electionId
    );

    await store.updateExportQaRunStatus(qaRunId, {
      status: 'failure',
      statusMessage: `Error starting QA job in CircleCI: ${message}`,
    });
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
          ballotStyleId: props.ballotStyleId,
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

export async function generateElectionPackageAndBallots(
  ctx: WorkerContext,
  payload: GenerateElectionPackageAndBallotsPayload,
  emitProgress: EmitProgressFunction,
  scratchDir: ScratchDir
): Promise<void> {
  const rendererPool = await createPlaywrightRendererPool();
  try {
    await generate(ctx, payload, rendererPool, emitProgress, scratchDir);
  } finally {
    // eslint-disable-next-line no-console
    rendererPool.close().catch(console.error);
  }
}

async function generate(
  ctx: WorkerContext,
  {
    electionId,
    electionSerializationFormat,
    shouldExportAudio,
    shouldExportSampleBallots,
    shouldExportTestBallots,
    numAuditIdBallots,
  }: GenerateElectionPackageAndBallotsPayload,
  rendererPool: RendererPool,
  emitProgress: EmitProgressFunction,
  scratchDir: ScratchDir
): Promise<void> {
  const { speechSynthesizer, translator } = ctx;
  const { store } = ctx.workspace;

  const electionRecord = await store.getElection(electionId);
  const { ballotLanguageConfigs, ballotTemplateId, jurisdictionId } =
    electionRecord;
  let { systemSettings } = electionRecord;
  const { compact } = await store.getBallotLayoutSettings(electionId);

  const officialBallotsZip = new Archiver();
  const sampleBallotsZip = new Archiver();
  const testBallotsZip = new Archiver();
  const electionPackageZip = new Archiver();

  // Make election package
  const metadata: ElectionPackageMetadata = LATEST_METADATA;
  electionPackageZip.addEntry(JSON.stringify(metadata, null, 2), {
    name: ElectionPackageFileName.METADATA,
  });

  const jurisdiction = await store.getJurisdiction(jurisdictionId);
  const election = addPollingPlacesForExport(
    electionRecord.election,
    jurisdiction,
    systemSettings
  );

  const [appStrings, hmpbStrings, electionStrings] =
    await getAllStringsForElectionPackage(
      election,
      translator,
      hmpbStringsCatalog,
      ballotLanguageConfigs
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
      ...electionRecord.systemSettings,
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
    format: electionSerializationFormat,
    version: jurisdiction.softwareVersion,
  };

  const { electionDefinition, ballotPaths } =
    await renderAllBallotPdfsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates[ballotTemplateId],
      allBallotProps,
      serializationOptions,
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
    name: ElectionPackageFileName.ELECTION,
  });

  electionPackageZip.addEntry(JSON.stringify(systemSettings, null, 2), {
    name: ElectionPackageFileName.SYSTEM_SETTINGS,
  });

  const registeredVoterCounts =
    await store.getRegisteredVoterCounts(electionId);
  electionPackageZip.addEntry(JSON.stringify(registeredVoterCounts, null, 2), {
    name: ElectionPackageFileName.REGISTERED_VOTER_COUNTS,
  });

  if (shouldExportAudio) {
    const { uiStringAudioIds, uiStringAudioClips } = generateAudioIdsAndClips({
      appStrings,
      electionStrings,
      electionTtsEdits: await store.ttsEditsAll({ jurisdictionId }),
      speechSynthesizer,
      emitProgress: (progress, total) =>
        emitProgress('Generating audio', progress, total),
    });
    electionPackageZip.addEntry(JSON.stringify(uiStringAudioIds, null, 2), {
      name: ElectionPackageFileName.AUDIO_IDS,
    });
    electionPackageZip.addEntry(uiStringAudioClips, {
      name: ElectionPackageFileName.AUDIO_CLIPS,
    });
  }

  await normalizeBallots({ ballotPaths, ballotTemplateId });

  const encodedBallots = generateEncodedBallots({
    ballotProps: allBallotProps,
    ballotPaths,
  });
  electionPackageZip.addEntry(encodedBallots, {
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
    electionPackageUrl,
    officialBallotsUrl,
    sampleBallotsUrl,
    testBallotsUrl,
  ] = await Promise.all([
    writeElectionZip(ctx, electionDefinition, {
      jurisdictionId,
      scratchDir,
      zip: electionPackageZip,
    }),

    writeZipFile(ctx, officialBallotsZip.finalize(), {
      jurisdictionId,
      name: `official-ballots-${ballotHash}.zip`,
    }),

    shouldExportSampleBallots
      ? writeZipFile(ctx, sampleBallotsZip.finalize(), {
          jurisdictionId,
          name: `sample-ballots-${ballotHash}.zip`,
        })
      : undefined,

    shouldExportTestBallots
      ? writeZipFile(ctx, testBallotsZip.finalize(), {
          jurisdictionId,
          name: `test-ballots-${ballotHash}.zip`,
        })
      : undefined,
  ]);

  await store.setElectionPackageExportInformation({
    electionId,
    ballotHash: electionDefinition.ballotHash,
    electionPackageUrl,
    electionData: electionDefinition.electionData,
    officialBallotsUrl,
    sampleBallotsUrl,
    testBallotsUrl,
  });

  // Trigger CircleCI QA build if enabled
  await triggerCircleCiQaBuild({
    store,
    electionId,
    electionPackageUrl,
    fileStorageClient: ctx.fileStorageClient,
    organizationId: jurisdiction.organization.id,
    vxsuiteVersion: jurisdiction.softwareVersion,
  });
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
  ctx: WorkerContext,
  electionDefinition: ElectionDefinition,
  p: { jurisdictionId: string; scratchDir: ScratchDir; zip: Archiver }
) {
  const scratchPath = randomScratchFilePath(p.scratchDir, { extension: 'zip' });

  const contentStream = p.zip.finalize();
  const hashingStream = new HashingPassthrough(createHash('sha256'));
  await pipeline(contentStream, hashingStream, createWriteStream(scratchPath));

  const electionPackageHash = hashingStream.digest('hex');
  const combinedHash = formatElectionHashes(
    electionDefinition.ballotHash,
    electionPackageHash
  );

  return writeZipFile(ctx, createReadStream(scratchPath), {
    jurisdictionId: p.jurisdictionId,
    name: `election-package-${combinedHash}.zip`,
  });
}

async function writeZipFile(
  ctx: WorkerContext,
  contents: Readable,
  p: { jurisdictionId: string; name: string }
) {
  const relativePath = `${p.jurisdictionId}/${p.name}`;
  await ctx.fileStorageClient.streamFile(relativePath, contents);

  return `/files/${relativePath}`;
}
