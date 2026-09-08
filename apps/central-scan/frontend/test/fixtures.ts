import {
  BatchScannerMachineStatus,
  ScanStatus,
} from '@votingworks/central-scan-backend';
import { BatchInfo } from '@votingworks/types';

export const DEFAULT_STATUS: ScanStatus = {
  state: 'idle',
  adjudicationsRemaining: 0,
  canUnconfigure: true,
  batches: [],
};

export function mockStatus(
  status: Partial<Omit<ScanStatus, 'state'>> = {},
  machineStatus: BatchScannerMachineStatus = { state: 'idle' }
): ScanStatus {
  return {
    ...DEFAULT_STATUS,
    ...status,
    ...machineStatus,
  };
}

export const MOCK_BATCH: BatchInfo = {
  id: 'id',
  batchNumber: 1,
  count: 1,
  label: 'Batch 1',
  startedAt: new Date(0).toISOString(),
  endedAt: new Date(0).toISOString(),
  pollingPlaceId: 'place-1',
};

export function mockBatch(batch: Partial<BatchInfo> = {}): BatchInfo {
  return {
    ...MOCK_BATCH,
    ...batch,
  };
}
