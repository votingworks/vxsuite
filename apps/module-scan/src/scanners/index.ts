import { ScannerStatus } from '@votingworks/types/api/module-scan'
import { SheetOf } from '../types'
export * from './fujitsu'
export * from './plustek'

export interface BatchControl {
  scanSheet(): Promise<SheetOf<string> | undefined>
  acceptSheet(): Promise<boolean>
  reviewSheet(): Promise<boolean>
  rejectSheet(): Promise<boolean>
  endBatch(): Promise<void>
}

export interface Scanner {
  getStatus(): Promise<ScannerStatus>
  scanSheets(directory?: string): BatchControl
  calibrate(): Promise<boolean>
}

export enum ScannerImageFormat {
  JPEG = 'jpeg',
  PNG = 'png',
}

export enum ScannerPageSize {
  Letter = 'letter',
  Legal = 'legal',
}

export enum ScannerMode {
  Lineart = 'lineart',
  Gray = 'gray',
  Color = 'color',
}
