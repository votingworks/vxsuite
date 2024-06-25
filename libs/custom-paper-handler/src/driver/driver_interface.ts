import { Coder, CoderError, Uint16, Uint8 } from '@votingworks/message-coder';
import { Result } from '@votingworks/basics';
import { ImageData } from '@votingworks/image-utils';
import {
  PrintingDensity,
  PrintingSpeed,
  RealTimeRequestIds,
} from './constants';
import {
  PaperHandlerBitmap,
  PaperHandlerStatus,
  PrinterStatusRealTimeExchangeResponse,
  RealTimeExchangeResponseWithoutData,
  SensorStatusRealTimeExchangeResponse,
} from './coders';
import {
  PaperMovementAfterScan,
  Resolution,
  ScanDataFormat,
  ScanDirection,
  ScanLight,
} from './scanner_config';
import { ScannerCapability } from './scanner_capability';

export interface PaperHandlerDriverInterface {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  transferInGeneric(): Promise<USBInTransferResult>;
  transferInAcknowledgement(): Promise<boolean>;
  clearGenericInBuffer(): Promise<void>;
  transferOutRealTime(requestId: Uint8): Promise<USBOutTransferResult>;
  transferInRealTime(): Promise<USBInTransferResult>;
  handleRealTimeExchange<T>(
    requestId: RealTimeRequestIds,
    coder: Coder<T>
  ): Promise<Result<T, CoderError>>;
  transferOutGeneric<T>(
    coder: Coder<T>,
    value: T
  ): Promise<USBOutTransferResult>;
  initializePrinter(): Promise<void>;
  validateRealTimeExchangeResponse(
    expectedRequestId: RealTimeRequestIds,
    response:
      | SensorStatusRealTimeExchangeResponse
      | PrinterStatusRealTimeExchangeResponse
      | RealTimeExchangeResponseWithoutData
  ): void;
  getScannerStatus(): Promise<SensorStatusRealTimeExchangeResponse>;
  getPrinterStatus(): Promise<PrinterStatusRealTimeExchangeResponse>;
  abortScan(): Promise<void>;
  resetScan(): Promise<void>;
  getPaperHandlerStatus(): Promise<PaperHandlerStatus>;
  handleGenericCommandWithAcknowledgement<T>(
    coder: Coder<T>,
    value: T
  ): Promise<boolean>;
  getScannerCapability(): Promise<ScannerCapability>;
  syncScannerConfig(): Promise<boolean>;
  setScanLight(scanLight: ScanLight): Promise<boolean>;
  setScanDataFormat(scanDataFormat: ScanDataFormat): Promise<boolean>;
  setScanResolution({
    horizontalResolution,
    verticalResolution,
  }: {
    horizontalResolution: Resolution;
    verticalResolution: Resolution;
  }): Promise<boolean>;
  setPaperMovementAfterScan(
    paperMovementAfterScan: PaperMovementAfterScan
  ): Promise<boolean>;
  setScanDirection(scanDirection: ScanDirection): Promise<boolean>;
  scan(): Promise<ImageData>;
  scanAndSave(pathOut: string): Promise<void>;
  loadPaper(): Promise<boolean>;
  ejectPaperToFront(): Promise<boolean>;
  parkPaper(): Promise<boolean>;
  presentPaper(): Promise<boolean>;
  ejectBallotToRear(): Promise<boolean>;
  calibrate(): Promise<boolean>;
  enablePrint(): Promise<boolean>;
  disablePrint(): Promise<boolean>;
  setMotionUnits(x: Uint8, y: Uint8): Promise<USBOutTransferResult>;
  setLeftMargin(numMotionUnits: Uint16): Promise<USBOutTransferResult>;
  setPrintingAreaWidth(numMotionUnits: Uint16): Promise<USBOutTransferResult>;
  setLineSpacing(numMotionUnits: Uint8): Promise<USBOutTransferResult>;
  setPrintingSpeed(printingSpeed: PrintingSpeed): Promise<USBOutTransferResult>;
  setPrintingDensity(
    printingDensity: PrintingDensity
  ): Promise<USBOutTransferResult>;
  setAbsolutePrintPosition(
    numMotionUnits: Uint16
  ): Promise<USBOutTransferResult>;
  setRelativePrintPosition(
    numMotionUnits: number
  ): Promise<USBOutTransferResult>;
  setRelativeVerticalPrintPosition(
    numMotionUnits: number
  ): Promise<USBOutTransferResult>;
  bufferChunk(
    chunkedCustomBitmap: PaperHandlerBitmap
  ): Promise<USBOutTransferResult>;
  printChunk(chunkedCustomBitmap: PaperHandlerBitmap): Promise<void>;
  print(numMotionUnitsToFeedPaper?: Uint8): Promise<void>;
}
