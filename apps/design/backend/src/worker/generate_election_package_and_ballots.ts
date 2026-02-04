import JsZip from 'jszip';
import { Buffer } from 'node:buffer';
import {
  ElectionSerializationFormat,
  ElectionPackageFileName,
  ElectionPackageMetadata,
  mergeUiStrings,
  formatElectionHashes,
  LATEST_METADATA,
  ElectionId,
  getPrecinctById,
  formatBallotHash,
  BallotType,
  ElectionIdSchema,
  ElectionSerializationFormatSchema,
  EncodedBallotEntry,
  BaseBallotProps,
} from '@votingworks/types';
import {
  hmpbStringsCatalog,
  ballotTemplates,
  renderAllBallotPdfsAndCreateElectionDefinition,
  createPlaywrightRendererPool,
} from '@votingworks/hmpb';
import { sha256 } from 'js-sha256';
import {
  generateAudioIdsAndClips,
  getAllStringsForElectionPackage,
} from '@votingworks/backend';
import {
  assertDefined,
  extractErrorMessage,
  find,
  iter,
  range,
  throwIllegalValue,
} from '@votingworks/basics';
import z from 'zod/v4';
import { Readable } from 'node:stream';
import { v4 as uuid } from 'uuid';
import { EmitProgressFunction, WorkerContext } from './context';
import {
  createBallotPropsForTemplate,
  formatElectionForExport,
} from '../ballots';
import { getBallotPdfFileName } from '../utils';
import {
  normalizeBallotColorModeForPrinting,
  renderCalibrationSheetPdf,
} from './ballot_pdfs';
import { createCircleCiClient, shouldTriggerCircleCi } from '../circleci_client';
import { baseUrl, circleCiProjectSlug, circleCiWebhookSecret } from '../globals';
import { Store } from '../store';
import { rootDebug } from '../debug';

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
}): Promise<void> {
  const { store, electionId, electionPackageUrl } = params;

  // Check if CircleCI integration is enabled
  if (!shouldTriggerCircleCi()) {
    debug('CircleCI integration not enabled, skipping QA build trigger');
    return;
  }

  const qaRunId = uuid();
  const webhookSecret = circleCiWebhookSecret();

  if (!webhookSecret) {
    debug('CircleCI webhook secret not configured, cannot trigger QA build');
    return;
  }

  // Construct the full URL to the export package
  const fullExportUrl = new URL(electionPackageUrl, baseUrl()).toString();

  // Construct the webhook URL
  const webhookUrl = new URL(
    `/api/export-qa-webhook/${qaRunId}`,
    baseUrl()
  ).toString();

  // Create QA run record
  await store.createExportQaRun({
    id: qaRunId,
    electionId,
    exportPackageUrl: fullExportUrl,
  });

  try {
    // Trigger CircleCI pipeline
    const circleCiClient = createCircleCiClient();
    const result = await circleCiClient.triggerPipeline({
      exportPackageUrl: fullExportUrl,
      webhookUrl,
      qaRunId,
      electionId,
    });

    // Construct a link to the pipeline page
    const projectSlug = circleCiProjectSlug();
    const jobUrl = projectSlug
      ? `https://app.circleci.com/pipelines/${projectSlug}/${result.pipelineNumber}`
      : undefined;

    // Update QA run with CircleCI pipeline ID and job URL
    await store.updateExportQaRunStatus(qaRunId, {
      status: 'in_progress',
      statusMessage: 'Waiting for CI job to start',
      circleCiWorkflowId: result.pipelineId,
      jobUrl,
    });

    debug('CircleCI QA build triggered successfully: electionId=%s, qaRunId=%s, pipelineId=%s',
      electionId,
      qaRunId,
      result.pipelineId
    );
  } catch (error) {
    const message = extractErrorMessage(error);

    // Log the error but don't fail the export
    debug('Error triggering CircleCI QA build: error=%s, electionId=%s',
      message,
      electionId
    );

    await store.updateExportQaRunStatus(qaRunId, {
      status: 'failure',
      statusMessage: `Error starting QA job in CircleCI: ${message}`,
    });
  }
}

function generateEncodedBallots(
  normalizedBallotPdfs: Array<{
    props: BaseBallotProps;
    ballotPdf: Uint8Array<ArrayBufferLike>;
  }>
): NodeJS.ReadableStream {
  return Readable.from(
    (function* generateJsonLines() {
      for (const { props, ballotPdf } of normalizedBallotPdfs) {
        const encodedBallot: EncodedBallotEntry = {
          ballotStyleId: props.ballotStyleId,
          precinctId: props.precinctId,
          ballotType: props.ballotType,
          ballotMode: props.ballotMode,
          watermark: props.watermark,
          compact: props.compact,
          ballotAuditId: props.ballotAuditId,
          encodedBallot: Buffer.from(ballotPdf).toString('base64'),
        };
        yield `${JSON.stringify(encodedBallot)}\n`;
      }
    })()
  );
}

export async function generateElectionPackageAndBallots(
  ctx: WorkerContext,
  {
    electionId,
    electionSerializationFormat,
    shouldExportAudio,
    shouldExportSampleBallots,
    shouldExportTestBallots,
    numAuditIdBallots,
  }: GenerateElectionPackageAndBallotsPayload,
  emitProgress: EmitProgressFunction
): Promise<void> {
  const { speechSynthesizer, translator } = ctx;
  const { store } = ctx.workspace;

  const electionRecord = await store.getElection(electionId);
  const { ballotLanguageConfigs, election, ballotTemplateId, jurisdictionId } =
    electionRecord;
  let { systemSettings } = electionRecord;
  const { compact } = await store.getBallotLayoutSettings(electionId);

  const officialBallotsZip = new JsZip();
  const sampleBallotsZip = new JsZip();
  const testBallotsZip = new JsZip();
  const electionPackageZip = new JsZip();

  // Make election package
  const metadata: ElectionPackageMetadata = LATEST_METADATA;
  electionPackageZip.file(
    ElectionPackageFileName.METADATA,
    JSON.stringify(metadata, null, 2)
  );

  const [appStrings, hmpbStrings, electionStrings] =
    await getAllStringsForElectionPackage(
      election,
      translator,
      hmpbStringsCatalog,
      ballotLanguageConfigs
    );

  electionPackageZip.file(
    ElectionPackageFileName.APP_STRINGS,
    JSON.stringify(appStrings, null, 2)
  );
  const ballotStrings = mergeUiStrings(electionStrings, hmpbStrings);

  const formattedElection = formatElectionForExport(election, ballotStrings);

  let allBallotProps = createBallotPropsForTemplate(
    ballotTemplateId,
    formattedElection,
    compact
  );
  // eslint-disable-next-line array-callback-return
  allBallotProps = allBallotProps.filter((props) => {
    switch (props.ballotMode) {
      case 'official':
        return true;

      case 'sample':
        return shouldExportSampleBallots;

      case 'test':
        return shouldExportTestBallots;

      default: {
        /* istanbul ignore next - @preserve */
        throwIllegalValue(props.ballotMode);
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
    allBallotProps = range(1, numAuditIdBallots + 1).map(
      (ballotIndex): BaseBallotProps => ({
        ...officialPrecinctBallotProps,
        ballotAuditId: String(ballotIndex),
      })
    );
  }

  const rendererPool = await createPlaywrightRendererPool();
  const { electionDefinition, ballotPdfs } =
    await renderAllBallotPdfsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates[ballotTemplateId],
      allBallotProps,
      electionSerializationFormat,
      emitProgress
    );
  electionPackageZip.file(
    ElectionPackageFileName.ELECTION,
    electionDefinition.electionData
  );

  electionPackageZip.file(
    ElectionPackageFileName.SYSTEM_SETTINGS,
    JSON.stringify(systemSettings, null, 2)
  );

  if (shouldExportAudio) {
    const { uiStringAudioIds, uiStringAudioClips } = generateAudioIdsAndClips({
      appStrings,
      electionStrings,
      electionTtsEdits: await store.ttsEditsAll({ jurisdictionId }),
      speechSynthesizer,
      emitProgress: (progress, total) =>
        emitProgress('Generating audio', progress, total),
    });
    electionPackageZip.file(
      ElectionPackageFileName.AUDIO_IDS,
      JSON.stringify(uiStringAudioIds, null, 2)
    );
    electionPackageZip.file(
      ElectionPackageFileName.AUDIO_CLIPS,
      uiStringAudioClips
    );
  }

  // Normalizing the ballot PDF colors is not very memory intensive, so it's safe
  // to do them all at once rather than using a worker pool like we do when
  // rendering ballots.
  const normalizedBallotPdfs = await Promise.all(
    iter(allBallotProps)
      .zip(ballotPdfs)
      .map(async ([props, ballotPdf]) => ({
        props,
        ballotPdf: await normalizeBallotColorModeForPrinting(
          ballotPdf,
          ballotTemplateId
        ),
      }))
      .toArray()
  );

  const encodedBallots = generateEncodedBallots(normalizedBallotPdfs);
  electionPackageZip.file(ElectionPackageFileName.BALLOTS, encodedBallots);

  const electionPackageZipContents = await electionPackageZip.generateAsync({
    type: 'nodebuffer',
    streamFiles: true,
  });
  const electionPackageHash = sha256(electionPackageZipContents);

  const combinedHash = formatElectionHashes(
    electionDefinition.ballotHash,
    electionPackageHash
  );

  electionPackageZip.file(
    ElectionPackageFileName.APP_STRINGS,
    JSON.stringify(appStrings, null, 2)
  );

  // Add ballots to ZIP files, grouped by ballot type:
  for (const { props, ballotPdf } of normalizedBallotPdfs) {
    const { precinctId, ballotStyleId, ballotType, ballotMode, ballotAuditId } =
      props;
    const precinct = assertDefined(getPrecinctById({ election, precinctId }));
    const fileName = getBallotPdfFileName(
      precinct.name,
      ballotStyleId,
      ballotType,
      ballotMode,
      ballotAuditId
    );

    switch (props.ballotMode) {
      case 'official':
        officialBallotsZip.file(fileName, ballotPdf);
        break;

      case 'sample':
        sampleBallotsZip.file(fileName, ballotPdf);
        break;

      case 'test':
        testBallotsZip.file(fileName, ballotPdf);
        break;

      default: {
        /* istanbul ignore next - @preserve */
        throwIllegalValue(props.ballotMode);
      }
    }
  }

  const calibrationSheetFilename = 'VxScan-calibration-sheet.pdf';
  const calibrationSheetPdf = await rendererPool.runTask((renderer) =>
    renderCalibrationSheetPdf(renderer, election.ballotLayout.paperSize)
  );

  officialBallotsZip.file(calibrationSheetFilename, calibrationSheetPdf);

  if (shouldExportTestBallots) {
    testBallotsZip.file(calibrationSheetFilename, calibrationSheetPdf);
  }

  // eslint-disable-next-line no-console
  rendererPool.close().catch(console.error);

  const ballotHash = formatBallotHash(electionDefinition.ballotHash);
  const [
    electionPackageUrl,
    officialBallotsUrl,
    sampleBallotsUrl,
    testBallotsUrl,
  ] = await Promise.all([
    writeZipFile(ctx, electionPackageZipContents, {
      jurisdictionId,
      name: `election-package-${combinedHash}.zip`,
    }),

    writeBallotsZip(ctx, {
      jurisdictionId,
      name: `official-ballots-${ballotHash}.zip`,
      zip: officialBallotsZip,
    }),

    shouldExportSampleBallots
      ? writeBallotsZip(ctx, {
        jurisdictionId,
        name: `sample-ballots-${ballotHash}.zip`,
        zip: sampleBallotsZip,
      })
      : undefined,

    shouldExportTestBallots
      ? writeBallotsZip(ctx, {
        jurisdictionId,
        name: `test-ballots-${ballotHash}.zip`,
        zip: testBallotsZip,
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
  });
}

async function writeBallotsZip(
  ctx: WorkerContext,
  p: { jurisdictionId: string; name: string; zip: JsZip }
) {
  const contents = await p.zip.generateAsync({
    type: 'nodebuffer',
    streamFiles: true,
  });

  return writeZipFile(ctx, contents, {
    jurisdictionId: p.jurisdictionId,
    name: p.name,
  });
}

async function writeZipFile(
  ctx: WorkerContext,
  contents: Buffer,
  p: { jurisdictionId: string; name: string }
) {
  const relativePath = `${p.jurisdictionId}/${p.name}`;
  const result = await ctx.fileStorageClient.writeFile(relativePath, contents);
  result.unsafeUnwrap();

  return `/files/${relativePath}`;
}
