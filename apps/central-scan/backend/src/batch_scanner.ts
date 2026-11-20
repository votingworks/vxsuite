import type { Result } from '@votingworks/basics';
import type {
  EncodedImage,
  HmpbBallotPaperSize,
  SheetOf,
} from '@votingworks/types';

export interface BatchScanner {
  isAttached(): boolean;
  isImprinterDetected(): Promise<boolean>;
  startBatch(options?: ScanOptions): BatchControl;
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
  /** Resolves to the next sheet, `undefined` once the tray is empty, or an error the scanner reported. */
  scanSheet(): Promise<Result<ScannedSheetInfo | undefined, BatchScannerError>>;
  /** Stops the batch and resolves once the scanner has stopped; also called after `scanSheet` fails. */
  endBatch(): Promise<void>;
}

export type BatchScannerErrorCode = 'jammed' | 'cover_open' | 'scan_failed';

export interface BatchScannerError {
  readonly code: BatchScannerErrorCode;
  readonly message: string;
}

/** A sheet the scanner wrote to files. */
export interface ScannedSheetFiles {
  frontPath: string;
  backPath: string;
  ballotAuditId?: string;
}

/** A sheet the scanner delivered in memory, front then back. */
export interface ScannedSheetImages {
  images: SheetOf<EncodedImage>;
  ballotAuditId?: string;
}

export type ScannedSheetInfo = ScannedSheetFiles | ScannedSheetImages;
