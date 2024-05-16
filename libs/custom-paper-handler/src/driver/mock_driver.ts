/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable vx/gts-no-public-class-fields */
import { Result } from '@votingworks/basics';
import { ImageFromScanner } from '@votingworks/custom-scanner';
import { Coder, CoderError } from '@votingworks/message-coder';
import makeDebug from 'debug';
import { MinimalWebUsbDevice } from './minimal_web_usb_device';
import { PaperHandlerBitmap, PaperHandlerStatus } from './coders';
import { Lock } from './lock';
import { ScannerCapability } from './scanner_capability';
import {
  ScannerConfig,
  ScanLight,
  ScanDataFormat,
  Resolution,
  PaperMovementAfterScan,
  ScanDirection,
  getDefaultConfig,
} from './scanner_config';
import { PaperHandlerDriverInterface } from './driver_interface';
import {
  PrintingDensity,
  PrintingSpeed,
  RealTimeRequestIds,
} from './constants';
import { mockMinimalWebUsbDevice } from './mock_minimal_web_usb_device';
import { defaultPaperHandlerStatus } from './test_utils';

const debug = makeDebug('custom-paper-handler:mock-driver');

// USBOutTransferResult is undefined at runtime
function makeUsbOutTransferResult(
  status: USBTransferStatus,
  bytesWritten: number
) {
  return {
    status,
    bytesWritten,
  };
}

export class MockPaperHandlerDriver implements PaperHandlerDriverInterface {
  readonly genericLock = new Lock();
  readonly realTimeLock = new Lock();
  readonly scannerConfig: ScannerConfig = getDefaultConfig();
  readonly webDevice: MinimalWebUsbDevice = mockMinimalWebUsbDevice();

  statusRef: PaperHandlerStatus = defaultPaperHandlerStatus();

  connect(): Promise<void> {
    return Promise.resolve();
  }
  async disconnect(): Promise<void> {
    await this.genericLock.acquire();
    this.genericLock.release();
    await this.realTimeLock.acquire();
    this.realTimeLock.release();
    return Promise.resolve();
  }
  getWebDevice(): MinimalWebUsbDevice {
    throw new Error('Method not implemented.');
  }
  transferInGeneric(): Promise<USBInTransferResult> {
    throw new Error('Method not implemented.');
  }
  transferInAcknowledgement(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  clearGenericInBuffer(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  transferOutRealTime(_requestId: number): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }
  transferInRealTime(): Promise<USBInTransferResult> {
    throw new Error('Method not implemented.');
  }
  handleRealTimeExchange<T>(
    _requestId: RealTimeRequestIds,
    _coder: Coder<T>
  ): Promise<Result<T, CoderError>> {
    throw new Error('Method not implemented.');
  }
  transferOutGeneric<T>(
    _coder: Coder<T>,
    _value: T
  ): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }
  initializePrinter(): Promise<void> {
    debug('initializePrinter called');
    return Promise.resolve();
  }
  validateRealTimeExchangeResponse(
    _expectedRequestId: RealTimeRequestIds,
    _response:
      | {
          requestId: number;
          returnCode: number;
          parkSensor: boolean;
          paperOutSensor: boolean;
          paperPostCisSensor: boolean;
          paperPreCisSensor: boolean;
          paperInputLeftInnerSensor: boolean;
          paperInputRightInnerSensor: boolean;
          paperInputLeftOuterSensor: boolean;
          paperInputRightOuterSensor: boolean;
          printHeadInPosition: boolean;
          scanTimeout: boolean;
          motorMove: boolean;
          scanInProgress: boolean;
          jamEncoder: boolean;
          paperJam: boolean;
          coverOpen: boolean;
          optoSensor: boolean;
          ballotBoxDoorSensor: boolean;
          ballotBoxAttachSensor: boolean;
          preHeadSensor: boolean;
          startOfPacket?: unknown;
          token?: unknown;
          optionalDataLength?: unknown;
        }
      | {
          requestId: number;
          returnCode: number;
          coverOpen: boolean;
          ticketPresentInOutput: boolean;
          paperNotPresent: boolean;
          dragPaperMotorOn: boolean;
          spooling: boolean;
          printingHeadUpError: boolean;
          notAcknowledgeCommandError: boolean;
          powerSupplyVoltageError: boolean;
          headNotConnected: boolean;
          comError: boolean;
          headTemperatureError: boolean;
          diverterError: boolean;
          headErrorLocked: boolean;
          printingHeadReadyToPrint: boolean;
          eepromError: boolean;
          ramError: boolean;
          startOfPacket?: unknown;
          token?: unknown;
          optionalDataLength?: unknown;
          dle?: unknown;
          eot?: unknown;
        }
      | {
          requestId: number;
          returnCode: number;
          startOfPacket?: unknown;
          token?: unknown;
        }
  ): void {
    throw new Error('Method not implemented.');
  }
  getScannerStatus(): Promise<{
    requestId: number;
    returnCode: number;
    parkSensor: boolean;
    paperOutSensor: boolean;
    paperPostCisSensor: boolean;
    paperPreCisSensor: boolean;
    paperInputLeftInnerSensor: boolean;
    paperInputRightInnerSensor: boolean;
    paperInputLeftOuterSensor: boolean;
    paperInputRightOuterSensor: boolean;
    printHeadInPosition: boolean;
    scanTimeout: boolean;
    motorMove: boolean;
    scanInProgress: boolean;
    jamEncoder: boolean;
    paperJam: boolean;
    coverOpen: boolean;
    optoSensor: boolean;
    ballotBoxDoorSensor: boolean;
    ballotBoxAttachSensor: boolean;
    preHeadSensor: boolean;
    startOfPacket?: unknown;
    token?: unknown;
    optionalDataLength?: unknown;
  }> {
    throw new Error('Method not implemented.');
  }
  getPrinterStatus(): Promise<{
    requestId: number;
    returnCode: number;
    coverOpen: boolean;
    ticketPresentInOutput: boolean;
    paperNotPresent: boolean;
    dragPaperMotorOn: boolean;
    spooling: boolean;
    printingHeadUpError: boolean;
    notAcknowledgeCommandError: boolean;
    powerSupplyVoltageError: boolean;
    headNotConnected: boolean;
    comError: boolean;
    headTemperatureError: boolean;
    diverterError: boolean;
    headErrorLocked: boolean;
    printingHeadReadyToPrint: boolean;
    eepromError: boolean;
    ramError: boolean;
    startOfPacket?: unknown;
    token?: unknown;
    optionalDataLength?: unknown;
    dle?: unknown;
    eot?: unknown;
  }> {
    throw new Error('Method not implemented.');
  }
  abortScan(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  resetScan(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  getPaperHandlerStatus(): Promise<PaperHandlerStatus> {
    return Promise.resolve(this.statusRef);
  }

  setPaperHandlerStatus(newStatus: Partial<PaperHandlerStatus>): void {
    this.statusRef = { ...this.statusRef, ...newStatus };
  }

  handleGenericCommandWithAcknowledgement<T>(
    _coder: Coder<T>,
    _value: T
  ): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  getScannerCapability(): Promise<ScannerCapability> {
    throw new Error('Method not implemented.');
  }
  syncScannerConfig(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  setScanLight(_scanLight: ScanLight): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  setScanDataFormat(_scanDataFormat: ScanDataFormat): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  setScanResolution(_resolution: {
    horizontalResolution: Resolution;
    verticalResolution: Resolution;
  }): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  setPaperMovementAfterScan(
    _paperMovementAfterScan: PaperMovementAfterScan
  ): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  setScanDirection(_scanDirection: ScanDirection): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  scan(): Promise<ImageData> {
    throw new Error('Method not implemented.');
  }
  scanAndSave(_pathOut: string): Promise<ImageFromScanner> {
    throw new Error('Method not implemented.');
  }
  loadPaper(): Promise<boolean> {
    return Promise.resolve(true);
  }
  ejectPaperToFront(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  parkPaper(): Promise<boolean> {
    return Promise.resolve(true);
  }
  presentPaper(): Promise<boolean> {
    debug('No-op presentPaper called');
    return Promise.resolve(true);
  }
  ejectBallotToRear(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  calibrate(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  enablePrint(): Promise<boolean> {
    return Promise.resolve(true);
  }
  disablePrint(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  setMotionUnits(_x: number, _y: number): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }
  setLeftMargin(_numMotionUnits: number): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }
  setPrintingAreaWidth(_numMotionUnits: number): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }
  setLineSpacing(numMotionUnits: number): Promise<USBOutTransferResult> {
    debug('setLineSpacing called with numMotionUnits: %d', numMotionUnits);
    return Promise.resolve(makeUsbOutTransferResult('ok', 0));
  }
  setPrintingSpeed(
    printingSpeed: PrintingSpeed
  ): Promise<USBOutTransferResult> {
    debug('setPrintingSpeed called with printingSpeed: %s', printingSpeed);
    return Promise.resolve(makeUsbOutTransferResult('ok', 0));
  }
  setPrintingDensity(
    _printingDensity: PrintingDensity
  ): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }
  setAbsolutePrintPosition(
    _numMotionUnits: number
  ): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }
  setRelativePrintPosition(
    _numMotionUnits: number
  ): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }
  setRelativeVerticalPrintPosition(
    _numMotionUnits: number
  ): Promise<USBOutTransferResult> {
    return Promise.resolve(makeUsbOutTransferResult('ok', 1));
  }
  bufferChunk(
    _chunkedCustomBitmap: PaperHandlerBitmap
  ): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }
  printChunk(_chunkedCustomBitmap: PaperHandlerBitmap): Promise<void> {
    return Promise.resolve();
  }
  print(_numMotionUnitsToFeedPaper?: number): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
