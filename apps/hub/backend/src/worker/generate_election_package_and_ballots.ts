import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  type ElectionSerializationFormat,
  ElectionPackageFileName,
  type ElectionPackageMetadata,
  mergeUiStrings,
  formatElectionHashes,
  LATEST_METADATA,
  type ElectionId,
  formatBallotHash,
  BallotType,
  ElectionIdSchema,
  ElectionSerializationFormatSchema,
  type EncodedBallotEntry,
  type BaseBallotProps,
  type SoftwareVersion,
  type ElectionDefinition,
} from '@votingworks/types';
import {
  hmpbStringsCatalog,
  ballotTemplates,
  renderAllBallotPdfsAndCreateElectionDefinition,
  createPlaywrightRendererPool,
  type ElectionSerializationOptions,
  type ScratchDir,
  type RendererPool,
  type BallotTemplateId,
  randomScratchFilePath,
  createBallotPropsForTemplate,
  getBallotPdfFileName,
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
import {
  addPollingPlacesForExport,
  Archiver,
  formatElectionForExport,
  needsColorNormalization,
  normalizeBallotColorModeForPrinting,
  renderCalibrationSheetPdf,
} from '@votingworks/election-definition-backend';
import z from 'zod/v4';
import { Readable } from 'node:stream';
import { createHash, randomUUID as uuid } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { EmitProgressFunction, WorkerContext } from './context.js';
import { CircleCiClient } from '../circleci_client.js';
import type { FileStorageClient } from '../file_storage_client.js';
import { baseUrl } from '../globals.js';
import { QaConfig } from '../qa_config.js';
import type { Store } from '../store.js';
import { rootDebug } from '../debug.js';

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
