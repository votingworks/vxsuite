import { ScanStatus } from '@votingworks/central-scan-backend';
import { BatchInfo } from '@votingworks/types';

export const DEFAULT_STATUS: ScanStatus = {
  isScannerAttached: true,
  ongoingBatchId: undefined,
  adjudicationsRemaining: 0,
  canUnconfigure: true,
  batches: [],
};

export function mockStatus(status: Partial<ScanStatus> = {}): ScanStatus {
  return {
    ...DEFAULT_STATUS,
    ...status,
  };
}

export const MOCK_BATCH: BatchInfo = {
  id: 'id',
  batchNumber: 1,
  count: 1,
  label: 'Batch 1',
  startedAt: new Date(0).toISOString(),
  endedAt: new Date(0).toISOString(),
};

export function mockBatch(batch: Partial<BatchInfo> = {}): BatchInfo {
  return {
    ...MOCK_BATCH,
    ...batch,
  };
}
