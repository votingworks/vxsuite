import type { HmpbBallotPaperSize } from '@votingworks/types';

export interface BatchScanner {
  isAttached(): boolean;
  isImprinterDetected(): Promise<boolean>;
  scanSheets(options?: ScanOptions): BatchControl;
}

export interface ScanOptions {
  /** Directory to write scanned images into; defaults to a new temporary directory. */
  directory?: string;
  /** Expected paper size; defaults to letter. */
  pageSize?: HmpbBallotPaperSize;
  /** Prefix for the audit ID to imprint on the ballot, an undefined value means no imprinting. */
  imprintIdPrefix?: string;
}

export interface BatchControl {
  /** Resolves to the next sheet, `undefined` once the tray is empty, or rejects on a scanner error. */
  scanSheet(): Promise<ScannedSheetInfo | undefined>;
  /** Stops the batch and resolves once the scanner has stopped; also called after `scanSheet` rejects. */
  endBatch(): Promise<void>;
}

export interface ScannedSheetInfo {
  frontPath: string;
  backPath: string;
  ballotAuditId?: string;
}
