export interface Scanner {}

export function openScanner(): Scanner;

export function getScannerStatus(scanner: Scanner): unknown;

export function setResolution(
  internalScanner: Scanner,
  resolution: number
): void;

export function setColorDepth(
  internalScanner: Scanner,
  colorDepth: number
): void;

export function setFeederEnabled(
  internalScanner: Scanner,
  feederEnabled: boolean
): void;

export interface ScannedDocument {
  frontSideImage: ImageData;
  backSideImage: ImageData;
}

export function getLastScannedDocument(
  internalScanner: Scanner
): ScannedDocument | undefined;

export enum Event {
  BeginScan = 'beginScan',
  EndScan = 'endScan',
  AbortScan = 'abortScan',
  EjectPaused = 'ejectPaused',
  EjectResumed = 'ejectResumed',
  FeederDisabled = 'feederDisabled',
}

export function getLastScannerEvent(
  internalScanner: Scanner
): Event | undefined;
