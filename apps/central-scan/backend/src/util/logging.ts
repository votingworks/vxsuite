import { LogEventId, Logger } from '@votingworks/logging';
import { BatchInfo } from '@votingworks/types';

export function logBatchComplete(
  logger: Logger,
  batch: BatchInfo
): Promise<void> {
  return logger.logAsCurrentRole(LogEventId.ScanBatchComplete, {
    disposition: 'success',
    message: `Scanning batch ${batch.id} successfully completed scanning ${batch.count} sheets.`,
    batchId: batch.id,
    sheetCount: batch.count,
    scanningEndedAt: batch.endedAt,
  });
}

export function logScanBatchContinueSuccess(
  logger: Logger,
  forceAccept: boolean
): Promise<void> {
  return logger.logAsCurrentRole(LogEventId.ScanBatchContinue, {
    disposition: 'success',
    message: forceAccept
      ? 'Sheet tabulated with warnings and scanning of batch continued.'
      : 'User indicated removing the sheet from tabulation and scanning continued without sheet.',
    sheetRemoved: !forceAccept,
  });
}

export function logScanBatchContinueFailure(
  logger: Logger,
  error: Error
): Promise<void> {
  return logger.logAsCurrentRole(LogEventId.ScanBatchContinue, {
    disposition: 'failure',
    message: `User attempt to continue scanning failed: ${error.message}`,
  });
}

export function logBatchStartSuccess(
  logger: Logger,
  batchId: BatchInfo['id']
): Promise<void> {
  return logger.logAsCurrentRole(LogEventId.ScanBatchInit, {
    disposition: 'success',
    message: `User has begun scanning a new batch with ID: ${batchId}`,
    batchId,
  });
}

export function logBatchStartFailure(
  logger: Logger,
  error: Error
): Promise<void> {
  return logger.logAsCurrentRole(LogEventId.ScanBatchInit, {
    disposition: 'failure',
    message: `User attempt to start scanning failed: ${error.message}`,
  });
}

export function logScanSheetSuccess(
  logger: Logger,
  batch: BatchInfo
): Promise<void> {
  return logger.logAsCurrentRole(LogEventId.ScanSheetComplete, {
    disposition: 'success',
    message: `Sheet number ${batch.count} in batch ${batch.id} scanned successfully`,
    batchId: batch.id,
    sheetCount: batch.count,
  });
}
