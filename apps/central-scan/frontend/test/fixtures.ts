import {
  BatchScannerMachineStatus,
  ScanStatus,
} from '@votingworks/central-scan-backend';
import { BatchInfo } from '@votingworks/types';

export const DEFAULT_STATUS: ScanStatus = {
  state: 'idle',
  isScannerAttached: true,
  canUnconfigure: true,
  batches: [],
};

export function mockStatus<
  M extends BatchScannerMachineStatus = { state: 'idle' },
>(
  status: Partial<Omit<ScanStatus, 'state'>> = {},
  machineStatus?: M
): Extract<ScanStatus, { state: M['state'] }> {
  const machine: BatchScannerMachineStatus = machineStatus ?? { state: 'idle' };
  const result: ScanStatus = { ...DEFAULT_STATUS, ...status, ...machine };
  return result as Extract<ScanStatus, { state: M['state'] }>;
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
