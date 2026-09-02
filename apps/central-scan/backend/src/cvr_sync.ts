import { Buffer } from 'node:buffer';
import * as grout from '@votingworks/grout';
import { assertDefined, iter, throwIllegalValue } from '@votingworks/basics';
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

/**
 * After this many consecutive transient failures sending the same batch, the
 * batch is marked failed and skipped until an operator retries it.
 */
export const MAX_CONSECUTIVE_SEND_FAILURES = 5;

/** Longest delay between transient-failure retries. */
export const MAX_SEND_RETRY_DELAY_MS = 60 * 1000;

/** The result of one attempt to send a batch. */
export type SendBatchOutcome =
  | { type: 'sent' }
  /** Likely to resolve on its own (e.g. host unreachable); retried with backoff. */
  | { type: 'transient-failure'; detail: string }
  /** Needs operator attention; the batch is skipped until manually retried. */
  | { type: 'fatal-failure'; detail: string };

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
}): Promise<SendBatchOutcome> {
  const { machineId, codeVersion } = getMachineConfig();
  // Batches can't exist while unconfigured
  const { electionDefinition } = assertDefined(store.getElectionRecord());

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
    return { type: 'transient-failure', detail: 'host unreachable' };
  }
  if (startResult.isErr()) {
    const errorType = startResult.err().type;
    logFailure('start', `host refused transfer (${errorType}).`);
    switch (errorType) {
      // These won't resolve without operator action.
      case 'ballot-hash-mismatch':
      case 'code-version-mismatch':
      case 'invalid-mode':
        return {
          type: 'fatal-failure',
          detail: `VxAdmin refused the transfer: ${errorType}`,
        };
      // The host may simply not be configured yet.
      case 'host-unconfigured':
      case 'scanner-unconfigured':
        return { type: 'transient-failure', detail: errorType };
      // istanbul ignore next -- compile-time check
      default:
        return throwIllegalValue(errorType);
    }
  }
  if (startResult.ok().alreadyComplete) {
    store.setBatchSentToAdmin(batch.id);
    logger.log(LogEventId.CentralScanNetworkStatus, 'system', {
      message: `Batch ${batch.id} was already fully imported by VxAdmin.`,
      batchId: batch.id,
    });
    return { type: 'sent' };
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
      return {
        type: 'fatal-failure',
        detail: `could not build a cast vote record for sheet ${sheet.id}`,
      };
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
      return { type: 'transient-failure', detail: 'host unreachable' };
    }
    if (response.status !== 200) {
      logFailure(
        'upload',
        `host rejected cast vote record ${castVoteRecordId} (status ${response.status}).`
      );
      return {
        type: 'transient-failure',
        detail: `VxAdmin rejected a cast vote record (status ${response.status})`,
      };
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
    return { type: 'transient-failure', detail: 'host unreachable' };
  }
  if (finishResult.isErr()) {
    const errorType = finishResult.err().type;
    logFailure('finish', `host could not complete the import (${errorType}).`);
    switch (errorType) {
      // Bad data won't fix itself on retry.
      case 'import-failed':
        return {
          type: 'fatal-failure',
          detail: 'VxAdmin could not import the batch',
        };
      // Recoverable by re-sending on the next pass.
      case 'transfer-not-found':
      case 'sheet-count-mismatch':
        return { type: 'transient-failure', detail: errorType };
      default:
        return throwIllegalValue(errorType);
    }
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
  return { type: 'sent' };
}

/**
 * Starts the CVR sync loop: while the scanner is registered with a VxAdmin
 * host, sends completed batches' cast vote records to it, oldest first, one
 * batch in flight at a time. A batch waiting to retry after a transient
 * failure, or marked failed, doesn't hold up the batches behind it.
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

  function markBatchFailed(batchId: string, detail: string): void {
    store.setBatchSendToAdminError(batchId, detail);
    logger.log(LogEventId.CentralScanNetworkStatus, 'system', {
      message: `Sending batch ${batchId} to VxAdmin failed and needs attention: ${detail}. It will not be sent again until retried; other batches continue to send.`,
      disposition: 'failure',
      batchId,
    });
  }

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
          store.clearSendToAdminAttempts();
          return;
        }
        // Failed batches and batches still waiting out a retry backoff are
        // excluded by the store, so neither holds up the batches behind it.
        const batch = store.getNextBatchToSendToAdmin();
        if (!batch) return;
        store.startSendingBatchToAdmin(batch.id);
        let outcome: SendBatchOutcome;
        try {
          outcome = await sendBatchToAdmin({
            store,
            logger,
            hostAddress: connection.hostAddress,
            batch,
          });
        } catch (error) {
          // Anything sendBatchToAdmin didn't classify itself (e.g. a failure
          // reading a sheet image) goes through the same retry flow as a
          // transient failure, so it's bounded and ends in "Send failed".
          logger.log(LogEventId.CentralScanNetworkStatus, 'system', {
            message: `Sending batch ${batch.id} to VxAdmin failed unexpectedly: ${error}`,
            disposition: 'failure',
            batchId: batch.id,
            stack: (error as Partial<Error>).stack,
          });
          outcome = {
            type: 'transient-failure',
            detail: `unexpected error (${error})`,
          };
        }
        switch (outcome.type) {
          case 'sent':
            break;
          case 'fatal-failure':
            markBatchFailed(batch.id, outcome.detail);
            break;
          case 'transient-failure': {
            const failures = store.recordBatchSendToAdminFailure(batch.id);
            if (failures >= MAX_CONSECUTIVE_SEND_FAILURES) {
              markBatchFailed(
                batch.id,
                `sending failed ${failures} times in a row (${outcome.detail})`
              );
            } else {
              // Exponential backoff: 2s after the first failure, then 4s, 8s,
              // 16s, …, capped at MAX_SEND_RETRY_DELAY_MS.
              store.deferBatchSendToAdmin(
                batch.id,
                Date.now() +
                  Math.min(2 ** failures * 1000, MAX_SEND_RETRY_DELAY_MS)
              );
            }
            break;
          }
          default:
            throwIllegalValue(outcome);
        }
      } finally {
        isSending = false;
      }
    }, NETWORK_POLLING_INTERVAL_MS);
  });
}
