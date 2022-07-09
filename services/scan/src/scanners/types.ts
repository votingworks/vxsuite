import { BallotPaperSize } from '@votingworks/types';
import { Scan } from '@votingworks/api';
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

export interface Scanner {
  getStatus(): Promise<Scan.ScannerStatus>;
  scanSheets(options?: ScanOptions): BatchControl;
  scanSheetsNoInterpret(): Promise<void>;
  calibrate(): Promise<boolean>;
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
