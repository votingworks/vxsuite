import {
  assertDefined,
  err,
  iter,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  buildBatchManifest,
  buildCastVoteRecordFiles,
  ScannerStateUnchangedByExport,
  VX_MACHINE_ID,
} from '@votingworks/backend';
import { BatchInfo } from '@votingworks/types';
import { LogEventId, Logger } from '@votingworks/logging';
import makeDebug from 'debug';
import fetch from 'node-fetch';
import { join } from 'node:path';
import { Workspace } from './util/workspace';
import { AdminHostClient, HostConnection } from './networking';
import { zipFilesToBuffer } from './util/zip';
import { getMachineConfig } from './machine_config';
import { CvrSyncStatus, SendCastVoteRecordsToHostError } from './types';
import { CVR_SYNC_INTERVAL_MS, CVR_SYNC_RETRY_BACKOFF_MS } from './globals';

const debug = makeDebug('scan:cvr-sync');

/**
 * The background sync that automatically sends saved batches to a connected
 * VxAdmin host, started by {@link startCvrSync}.
 */
export interface CvrSync {
  getStatus(): CvrSyncStatus;

  /**
   * Runs a sync pass now (joining the in-flight pass if there is one),
   * ignoring any failure backoff. Resolves when the pass completes.
   */
  triggerSync(): Promise<void>;

  stop(): void;
}

function describeSendError(error: SendCastVoteRecordsToHostError): string {
  switch (error.type) {
    /* istanbul ignore next - sendBatchToHost is only called with a connection */
    case 'no-host-connected':
      return 'No VxAdmin host is connected.';
    case 'export-failed':
      return `Error preparing cast vote records: ${JSON.stringify(
        error.error
      )}`;
    case 'upload-failed':
      return error.message;
    // istanbul ignore next -- compile-time check
    default:
      throwIllegalValue(error);
  }
}

/**
 * Sends a single saved batch to the VxAdmin host as its own transfer session:
 * one `startCvrTransfer` with a manifest containing just this batch, one
 * upload per accepted sheet in the batch, and one `finishCvrTransfer`.
 */
async function sendBatchToHost({
  workspace,
  hostConnection,
  logger,
  batch,
  onProgress,
}: {
  workspace: Workspace;
  hostConnection: HostConnection;
  logger: Logger;
  batch: BatchInfo;
  onProgress: (sheetsSent: number, sheetsTotal: number) => void;
}): Promise<
  Result<
    { newlyAdded: number; alreadyPresent: number },
    SendCastVoteRecordsToHostError
  >
> {
  const { store } = workspace;

  function logFailure(message: string): void {
    logger.log(LogEventId.ExportCastVoteRecordsComplete, 'system', {
      disposition: 'failure',
      message: `Error sending batch ${batch.label} to VxAdmin host ${hostConnection.machineId}. ${message}`,
    });
  }

  try {
    const { electionDefinition } = assertDefined(store.getElectionRecord());
    const systemSettings = assertDefined(store.getSystemSettings());
    const scannerState: ScannerStateUnchangedByExport = {
      batches: [batch],
      electionDefinition,
      systemSettings,
      inTestMode: store.getTestMode(),
      markThresholds: systemSettings.markThresholds,
    };
    const acceptedSheets = iter(store.forEachAcceptedSheet())
      .filter((sheet) => sheet.batchId === batch.id)
      .toArray();
    onProgress(0, acceptedSheets.length);

    const startResult = await hostConnection.apiClient.startCvrTransfer({
      machineId: getMachineConfig().machineId,
      batchManifest: buildBatchManifest({
        batches: [batch],
        scannerId: VX_MACHINE_ID,
      }),
      isTestMode: scannerState.inTestMode,
    });
    if (startResult.isErr()) {
      const message = `Host refused the transfer: ${JSON.stringify(
        startResult.err()
      )}`;
      logFailure(message);
      return err({ type: 'upload-failed', message });
    }
    const { sessionId } = startResult.ok();
    const uploadUrl = `${hostConnection.address}/api/cvr-transfer/${sessionId}/cvr`;

    // Build and send each cast vote record individually so that memory usage
    // stays bounded
    let sent = 0;
    for (const sheet of acceptedSheets) {
      const buildResult = await buildCastVoteRecordFiles(scannerState, sheet);
      if (buildResult.isErr()) {
        logFailure(
          `Error building cast vote record: ${JSON.stringify(
            buildResult.err()
          )}`
        );
        return err({ type: 'export-failed', error: buildResult.err() });
      }
      const { castVoteRecordId, files } = buildResult.ok();
      const zipBuffer = await zipFilesToBuffer(
        files.map((file) => ({
          path: join(castVoteRecordId, file.fileName),
          contents: file.open(),
        }))
      );
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/zip' },
        body: zipBuffer,
      });
      if (!response.ok) {
        const message = `Host responded with status ${
          response.status
        }: ${await response.text()}`;
        logFailure(message);
        return err({ type: 'upload-failed', message });
      }
      sent += 1;
      onProgress(sent, acceptedSheets.length);
      debug(
        'sent cvr %s (%d/%d) for batch %s: %d bytes',
        castVoteRecordId,
        sent,
        acceptedSheets.length,
        batch.id,
        zipBuffer.byteLength
      );
    }

    const finishResult = await hostConnection.apiClient.finishCvrTransfer({
      sessionId,
    });
    if (finishResult.isErr()) {
      const message = `Host failed to complete the transfer: ${JSON.stringify(
        finishResult.err()
      )}`;
      logFailure(message);
      return err({ type: 'upload-failed', message });
    }
    return ok(finishResult.ok());
  } catch (error) {
    const message = error instanceof Error ? error.message : `${error}`;
    logFailure(message);
    return err({ type: 'upload-failed', message });
  }
}

/**
 * Starts the background sync that sends saved batches to a connected VxAdmin
 * host. Each batch is sent as its own export as soon as it is saved (see
 * `saveBatch` in `app.ts`, which triggers a pass immediately); batches that
 * couldn't be sent (e.g. during a network outage) are picked up by the polling
 * loop as soon as a host connection is available again.
 */
export function startCvrSync({
  workspace,
  adminHostClient,
  logger,
  pollingIntervalMs = CVR_SYNC_INTERVAL_MS,
}: {
  workspace: Workspace;
  adminHostClient: AdminHostClient;
  logger: Logger;
  pollingIntervalMs?: number;
}): CvrSync {
  const { store } = workspace;
  let state: CvrSyncStatus['state'] = 'idle';
  let currentBatch: CvrSyncStatus['currentBatch'];
  let lastError: string | undefined;
  let backoffUntil = 0;
  let currentPass: Promise<void> | undefined;

  function setCurrentBatch(progress: CvrSyncStatus['currentBatch']): void {
    currentBatch = progress;
  }

  async function syncPass(): Promise<void> {
    const hostConnection = adminHostClient.getHostConnection();
    if (!hostConnection) {
      return;
    }
    const unsentBatches = store.getBatchesUnsentToAdmin();
    if (unsentBatches.length === 0) {
      return;
    }

    state = 'syncing';
    try {
      for (const batch of unsentBatches) {
        setCurrentBatch({
          batchId: batch.id,
          label: batch.label,
          sheetsSent: 0,
          sheetsTotal: batch.count,
        });
        logger.log(LogEventId.ExportCastVoteRecordsInit, 'system', {
          message: `Sending batch ${batch.label} (${batch.count} sheet(s)) to VxAdmin host ${hostConnection.machineId}...`,
        });
        const result = await sendBatchToHost({
          workspace,
          hostConnection,
          logger,
          batch,
          onProgress: (sheetsSent, sheetsTotal) =>
            setCurrentBatch({
              batchId: batch.id,
              label: batch.label,
              sheetsSent,
              sheetsTotal,
            }),
        });
        if (result.isErr()) {
          lastError = describeSendError(result.err());
          backoffUntil = Date.now() + CVR_SYNC_RETRY_BACKOFF_MS;
          return;
        }
        store.markBatchSentToAdmin(batch.id);
        lastError = undefined;
        const { newlyAdded, alreadyPresent } = result.ok();
        logger.log(LogEventId.ExportCastVoteRecordsComplete, 'system', {
          disposition: 'success',
          message: `Successfully sent batch ${batch.label} to VxAdmin host ${hostConnection.machineId}. Host imported ${newlyAdded} new cast vote record(s) and ignored ${alreadyPresent} duplicate(s).`,
        });
      }
    } finally {
      state = 'idle';
      setCurrentBatch(undefined);
    }
  }

  function runPass(): Promise<void> {
    if (!currentPass) {
      currentPass = syncPass().finally(() => {
        currentPass = undefined;
      });
    }
    return currentPass;
  }

  const interval = setInterval(() => {
    /* istanbul ignore next - timing-dependent backoff */
    if (Date.now() < backoffUntil) {
      return;
    }
    void runPass();
  }, pollingIntervalMs);

  return {
    getStatus: () => ({
      state,
      unsentBatchCount: store.getBatchesUnsentToAdmin().length,
      currentBatch,
      lastError,
    }),
    triggerSync: () => {
      backoffUntil = 0;
      return runPass();
    },
    stop: () => clearInterval(interval),
  };
}
