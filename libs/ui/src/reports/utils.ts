import { Tabulation } from '@votingworks/types';

export function getBatchLabel(batchId: string): string {
  return batchId === Tabulation.MANUAL_BATCH_ID
    ? 'Manual'
    : batchId.slice(0, Tabulation.BATCH_ID_DISPLAY_LENGTH);
}

export function getScannerLabel(scannerId: string): string {
  return scannerId === Tabulation.MANUAL_SCANNER_ID ? 'Manual' : scannerId;
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
