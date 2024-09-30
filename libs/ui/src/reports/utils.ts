import { find } from '@votingworks/basics';
import { Tabulation } from '@votingworks/types';

export type LabeledScannerBatch = Tabulation.ScannerBatch & { label: string };

// VxScan and VxCentralScan produce batch labels of the form 'Batch 1',
// 'Batch 2', etc., so we don't need to prefix them with 'Batch'.
export function getBatchLabel(
  batchId: string,
  scannerBatches: LabeledScannerBatch[]
): string {
  return batchId === Tabulation.MANUAL_BATCH_ID
    ? 'Manual Tallies'
    : find(scannerBatches, (batch) => batch.batchId === batchId).label;
}

export function getScannerLabel(scannerId: string): string {
  return scannerId === Tabulation.MANUAL_SCANNER_ID
    ? 'Manual Tallies'
    : scannerId;
}

export function prefixedTitle({
  isOfficial,
  isForLogicAndAccuracyTesting,
  title,
}: {
  isOfficial?: boolean;
  isForLogicAndAccuracyTesting?: boolean;
  title: string;
}): string {
  let prefix = '';
  if (isForLogicAndAccuracyTesting) {
    prefix = 'Test Deck';
  } else {
    prefix = isOfficial ? 'Official' : 'Unofficial';
  }

  return `${prefix} ${title}`;
}
