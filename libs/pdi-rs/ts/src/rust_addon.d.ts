export type ScanMode = 0 | 1;
export type DuplexMode = 0 | 1;

export interface Settings {
  scanMode?: ScanMode;
  duplexMode?: DuplexMode;
}

export interface Scanner {}

export function openScanner(settings?: Settings): Promise<Scanner>;

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

export function getLastScannerEvent(
  internalScanner: Scanner
): string | undefined;

export function acceptDocumentBack(internalScanner: Scanner): void;

export function rejectDocumentFront(internalScanner: Scanner): void;

export function rejectAndHoldDocumentFront(internalScanner: Scanner): void;
