import { BallotPaperSize } from '@votingworks/types';
import { SheetOf } from '../types';

export interface BatchControl {
  scanSheet(): Promise<SheetOf<string> | undefined>;
  acceptSheet(): Promise<boolean>;
  reviewSheet(): Promise<boolean>;
  rejectSheet(): Promise<boolean>;
  endBatch(): Promise<void>;
}

export interface ScanOptions {
  directory?: string;
  pageSize?: BallotPaperSize;
}

export interface BatchScanner {
  scanSheets(options?: ScanOptions): BatchControl;
}

export enum ScannerImageFormat {
  JPEG = 'jpeg',
  PNG = 'png',
}

export enum ScannerMode {
  Lineart = 'lineart',
  Gray = 'gray',
  Color = 'color',
}
