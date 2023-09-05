import { Coder, CoderError, Uint16, Uint8 } from '@votingworks/message-coder';
import { Result } from '@votingworks/basics';
import { ImageFromScanner } from '@votingworks/custom-scanner';
import { Mutex } from '@votingworks/utils';
import { MinimalWebUsbDevice } from './minimal_web_usb_device';
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
  ScannerConfig,
} from './scanner_config';
import { ScannerCapability } from './scanner_capability';

export interface PaperHandlerDriverInterface {
  readonly publicApiMutex: Mutex<undefined>;
  readonly webDeviceMutex: Mutex<MinimalWebUsbDevice>;
  readonly scannerConfig: ScannerConfig;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  transferOutGeneric<T>(
    webDevice: MinimalWebUsbDevice,
    coder: Coder<T>,
    value: T
  ): Promise<USBOutTransferResult>;
  transferInGeneric(
    webDevice: MinimalWebUsbDevice
  ): Promise<USBInTransferResult>;
  clearGenericInBuffer(): Promise<void>;
  transferOutRealTime(
    webDevice: MinimalWebUsbDevice,
    requestId: Uint8
  ): Promise<USBOutTransferResult>;
  transferInRealTime(
    webDevice: MinimalWebUsbDevice
  ): Promise<USBInTransferResult>;
  handleRealTimeExchange<T>(
    requestId: RealTimeRequestIds,
    coder: Coder<T>
  ): Promise<Result<T, CoderError>>;
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
  scanAndSave(pathOut: string): Promise<ImageFromScanner>;
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
    webDevice: MinimalWebUsbDevice,
    chunkedCustomBitmap: PaperHandlerBitmap
  ): Promise<USBOutTransferResult>;
  printChunk(chunkedCustomBitmap: PaperHandlerBitmap): Promise<void>;
  print(numMotionUnitsToFeedPaper?: Uint8): Promise<void>;
}
