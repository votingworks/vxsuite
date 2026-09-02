import { Buffer } from 'node:buffer';
import * as grout from '@votingworks/grout';
import { assertDefined, iter } from '@votingworks/basics';
import type { ReadableFile } from '@votingworks/auth';
import {
  AcceptedSheet,
  buildCastVoteRecordFiles,
  ScannerStateUnchangedByExport,
} from '@votingworks/backend';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import {
  getCvrTransferUploadPath,
  NETWORK_POLLING_INTERVAL_MS,
  VxAdminHostApi,
} from '@votingworks/networking';
import { BatchInfo } from '@votingworks/types';
import { createZip } from '@votingworks/utils';
import makeDebug from 'debug';
import { getMachineConfig } from './machine_config.js';
import { Store } from './store.js';

const debug = makeDebug('scan:cvr-sync');

/**
 * Timeout for transfer requests to the host. Finishing a transfer imports
 * the whole batch on the host, so this is much longer than the heartbeat
 * timeout.
 */
export const CVR_TRANSFER_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

async function readableFileToBuffer(file: ReadableFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of file.open()) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Sends one batch's cast vote records to the host: start → one zip upload
 * per sheet → finish. Any failure simply returns; the sync loop retries the
 * same batch on its next pass, and the host's per-record dedupe makes
 * re-sends safe.
 */
async function sendBatchToAdmin({
  store,
  logger,
  hostAddress,
  batch,
}: {
  store: Store;
  logger: BaseLogger;
  hostAddress: string;
  batch: BatchInfo;
}): Promise<void> {
  const { machineId, codeVersion } = getMachineConfig();
  const electionRecord = store.getElectionRecord();
  // @coverage-exclude: batches can't exist while unconfigured
  if (!electionRecord) return;
  const { electionDefinition } = electionRecord;

  const systemSettings = assertDefined(store.getSystemSettings());
  const scannerState: ScannerStateUnchangedByExport = {
    batches: store.getBatches(),
    electionDefinition,
    systemSettings,
    inTestMode: store.getTestMode(),
    markThresholds: systemSettings.markThresholds,
  };

  const sheets: AcceptedSheet[] = iter(store.forEachAcceptedSheet())
    .filter((sheet) => sheet.batchId === batch.id)
    .toArray();

  const apiClient = grout.createClient<VxAdminHostApi>({
    baseUrl: `${hostAddress}/api`,
    timeout: CVR_TRANSFER_REQUEST_TIMEOUT_MS,
  });

  function logFailure(step: string, detail: string): void {
    logger.log(LogEventId.CentralScanNetworkStatus, 'system', {
      message: `Sending batch ${batch.id} to VxAdmin failed at ${step}: ${detail} Will retry.`,
      disposition: 'failure',
      batchId: batch.id,
      step,
    });
  }

  logger.log(LogEventId.CentralScanNetworkStatus, 'system', {
    message: `Sending batch ${batch.id} (${sheets.length} sheets) to VxAdmin at ${hostAddress}.`,
    batchId: batch.id,
    sheetCount: sheets.length,
    hostAddress,
  });

  let startResult;
  try {
    startResult = await apiClient.startCvrTransfer({
      machineId,
      codeVersion,
      ballotHash: electionDefinition.ballotHash,
      batchId: batch.id,
      label: batch.label,
      pollingPlaceId: batch.pollingPlaceId,
      sheetCount: sheets.length,
      startedAt: batch.startedAt,
      isTestMode: scannerState.inTestMode,
    });
  } catch (error) {
    logFailure('start', `host unreachable (${error}).`);
    return;
  }
  if (startResult.isErr()) {
    logFailure('start', `host refused transfer (${startResult.err().type}).`);
    return;
  }
  if (startResult.ok().alreadyComplete) {
    store.setBatchSentToAdmin(batch.id);
    logger.log(LogEventId.CentralScanNetworkStatus, 'system', {
      message: `Batch ${batch.id} was already fully imported by VxAdmin.`,
      batchId: batch.id,
    });
    return;
  }

  for (const sheet of sheets) {
    const buildResult = await buildCastVoteRecordFiles(scannerState, sheet);
    if (buildResult.isErr()) {
      logFailure(
        'build',
        `could not build cast vote record for sheet ${sheet.id} (${
          buildResult.err().type
        }).`
      );
      return;
    }
    const { castVoteRecordId, files } = buildResult.ok();

    const zipEntries: Record<string, Buffer> = {};
    for (const file of files) {
      zipEntries[file.fileName] = await readableFileToBuffer(file);
    }
    const zipData = await createZip(zipEntries);

    let response: Response;
    try {
      response = await fetch(
        hostAddress +
          getCvrTransferUploadPath(machineId, batch.id, castVoteRecordId),
        {
          method: 'POST',
          headers: { 'content-type': 'application/zip' },
          body: new Uint8Array(zipData),
          signal: AbortSignal.timeout(CVR_TRANSFER_REQUEST_TIMEOUT_MS),
        }
      );
    } catch (error) {
      logFailure('upload', `host unreachable (${error}).`);
      return;
    }
    if (response.status !== 200) {
      logFailure(
        'upload',
        `host rejected cast vote record ${castVoteRecordId} (status ${response.status}).`
      );
      return;
    }
  }

  let finishResult;
  try {
    finishResult = await apiClient.finishCvrTransfer({
      machineId,
      batchId: batch.id,
    });
  } catch (error) {
    logFailure('finish', `host unreachable (${error}).`);
    return;
  }
  if (finishResult.isErr()) {
    logFailure(
      'finish',
      `host could not complete the import (${finishResult.err().type}).`
    );
    return;
  }

  store.setBatchSentToAdmin(batch.id);
  logger.log(LogEventId.CentralScanNetworkStatus, 'system', {
    message: `Sent batch ${batch.id} (${
      finishResult.ok().cvrCount
    } cast vote records) to VxAdmin.`,
    disposition: 'success',
    batchId: batch.id,
    cvrCount: finishResult.ok().cvrCount,
  });
}

/**
 * Starts the CVR sync loop: while the scanner is registered with a VxAdmin
 * host, sends completed batches' cast vote records to it, oldest first, one
 * batch at a time.
 */
export function startCvrSync({
  store,
  logger,
}: {
  store: Store;
  logger: BaseLogger;
}): void {
  debug('Starting CVR sync loop');
  let isSending = false;

  process.nextTick(() => {
    setInterval(async () => {
      // @coverage-exclude: re-entrancy guard
      if (isSending) return;
      isSending = true;
      try {
        const connection = store.getNetworkConnectionInfo();
        if (
          connection.status !== 'online-host-detected' ||
          !connection.hostAddress
        ) {
          return;
        }
        const batch = store.getNextBatchToSendToAdmin();
        if (!batch) return;
        await sendBatchToAdmin({
          store,
          logger,
          hostAddress: connection.hostAddress,
          batch,
        });
      } catch (error) {
        // @coverage-exclude: defensive
        debug('Error in CVR sync loop: %s', error);
      } finally {
        isSending = false;
      }
    }, NETWORK_POLLING_INTERVAL_MS);
  });
}
