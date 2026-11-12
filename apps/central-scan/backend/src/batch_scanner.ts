import type { HmpbBallotPaperSize } from '@votingworks/types';

export interface BatchScanner {
  isAttached(): boolean;
  isImprinterDetected(): Promise<boolean>;
  scanSheets(options?: ScanOptions): BatchControl;
}

export interface ScanOptions {
  directory?: string;
  pageSize?: HmpbBallotPaperSize;
  imprintIdPrefix?: string; // Prefix for the audit ID to imprint on the ballot, an undefined value means no imprinting
}

export interface BatchControl {
  scanSheet(): Promise<ScannedSheetInfo | undefined>;
  endBatch(): Promise<void>;
}

export interface ScannedSheetInfo {
  frontPath: string;
  backPath: string;
  ballotAuditId?: string;
}
