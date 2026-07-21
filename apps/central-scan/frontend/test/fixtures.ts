import {
  BatchInfoWithSyncStatus,
  ScanStatus,
} from '@votingworks/central-scan-backend';

export const DEFAULT_STATUS: ScanStatus = {
  isScannerAttached: true,
  currentBatch: undefined,
  adjudicationsRemaining: 0,
  canUnconfigure: true,
  batches: [],
  nextBatchNumber: 1,
};

export function mockStatus(status: Partial<ScanStatus> = {}): ScanStatus {
  return {
    ...DEFAULT_STATUS,
    ...status,
  };
}

export const MOCK_BATCH: BatchInfoWithSyncStatus = {
  id: 'id',
  batchNumber: 1,
  count: 1,
  label: 'Batch 1',
  startedAt: new Date(0).toISOString(),
  endedAt: new Date(0).toISOString(),
  pollingPlaceId: 'place-1',
};

export function mockBatch(
  batch: Partial<BatchInfoWithSyncStatus> = {}
): BatchInfoWithSyncStatus {
  return {
    ...MOCK_BATCH,
    ...batch,
  };
}
