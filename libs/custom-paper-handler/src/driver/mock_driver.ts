import { Result, sleep } from '@votingworks/basics';
import { CoderError } from '@votingworks/message-coder';
import makeDebug from 'debug';
import {
  BLANK_PAGE_IMAGE_DATA,
  ImageData,
  writeImageData,
} from '@votingworks/image-utils';
import {
  PaperHandlerStatus,
  PrinterStatusRealTimeExchangeResponse,
  SensorStatusRealTimeExchangeResponse,
} from './coders';
import { ScannerCapability } from './scanner_capability';
import { PaperHandlerDriverInterface } from './driver_interface';
import { PrintingSpeed } from './constants';
import { defaultPaperHandlerStatus } from './test_utils';

const debug = makeDebug('custom-paper-handler:mock-driver');

// @coverage-defer
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

const MOCK_STATUSES_DEFINITIONS = {
  noPaper: defaultPaperHandlerStatus(),
  paperInserted: {
    ...defaultPaperHandlerStatus(),
    paperInputLeftInnerSensor: true,
    paperInputLeftOuterSensor: true,
    paperInputRightInnerSensor: true,
    paperInputRightOuterSensor: true,
  },
  paperPartiallyInserted: {
    ...defaultPaperHandlerStatus(),
    paperInputLeftOuterSensor: true,
  },
  paperInScannerNotParked: {
    ...defaultPaperHandlerStatus(),
    paperInputLeftInnerSensor: true,
    paperInputLeftOuterSensor: true,
    paperInputRightInnerSensor: true,
    paperInputRightOuterSensor: true,
    paperPreCisSensor: true,
  },
  paperJammed: {
    ...defaultPaperHandlerStatus(),
    paperJam: true,
    paperPreCisSensor: true,
  },
  paperJammedNoPaper: {
    ...defaultPaperHandlerStatus(),
    paperJam: true,
  },
  paperParked: {
    ...defaultPaperHandlerStatus(),
    paperPreCisSensor: true,
    parkSensor: true,
  },
  presentingPaper: {
    ...defaultPaperHandlerStatus(),
    paperInputLeftInnerSensor: true,
    paperInputLeftOuterSensor: true,
    paperInputRightInnerSensor: true,
    paperInputRightOuterSensor: true,
    preHeadSensor: true,
  },
} as const satisfies Readonly<Record<string, PaperHandlerStatus>>;

export type MockPaperHandlerStatus = keyof typeof MOCK_STATUSES_DEFINITIONS;

export class MockPaperHandlerDriver implements PaperHandlerDriverInterface {
  private statusRef: PaperHandlerStatus = defaultPaperHandlerStatus();
  private mockStatus: MockPaperHandlerStatus = 'noPaper';
  private mockPaperContents?: ImageData;
  private coverOpen = false;

  constructor() {
    this.setMockStatus('noPaper');
  }

  // @coverage-defer
  connect(): Promise<void> {
    return Promise.resolve();
  }

  // @coverage-defer
  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  // @coverage-defer
  transferInGeneric(): Promise<USBInTransferResult> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  transferInAcknowledgement(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  clearGenericInBuffer(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  transferOutRealTime(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  transferInRealTime(): Promise<USBInTransferResult> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  handleRealTimeExchange(): Promise<Result<never, CoderError>> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  transferOutGeneric(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  initializePrinter(): Promise<void> {
    debug('initializePrinter called');
    return Promise.resolve();
  }

  // @coverage-defer
  validateRealTimeExchangeResponse(): void {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  getScannerStatus(): Promise<SensorStatusRealTimeExchangeResponse> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  getPrinterStatus(): Promise<PrinterStatusRealTimeExchangeResponse> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  async abortScan(): Promise<void> {
    await sleep(500);
  }

  // @coverage-defer
  async resetScan(): Promise<void> {
    await sleep(500);
  }

  getPaperHandlerStatus(): Promise<PaperHandlerStatus> {
    return Promise.resolve(this.statusRef);
  }

  // @coverage-defer
  handleGenericCommandWithAcknowledgement(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  getScannerCapability(): Promise<ScannerCapability> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  syncScannerConfig(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  setScanLight(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  setScanDataFormat(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  setScanResolution(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  setPaperMovementAfterScan(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  setScanDirection(): Promise<boolean> {
    return Promise.resolve(true);
  }

  scan(): Promise<ImageData> {
    // @coverage-defer
    return Promise.resolve(this.mockPaperContents || BLANK_PAGE_IMAGE_DATA);
  }

  async scanAndSave(pathOut: string): Promise<void> {
    const scannedImage = await this.scan();
    await writeImageData(pathOut, scannedImage);
  }

  loadPaper(): Promise<boolean> {
    this.setMockStatus('paperInScannerNotParked');

    return Promise.resolve(true);
  }

  async ejectPaperToFront(): Promise<boolean> {
    this.setMockStatus('noPaper');

    return Promise.resolve(true);
  }

  async parkPaper(): Promise<boolean> {
    this.setMockStatus('paperParked');

    return Promise.resolve(true);
  }

  async presentPaper(): Promise<boolean> {
    this.setMockStatus('presentingPaper');

    return Promise.resolve(true);
  }

  async ejectBallotToRear(): Promise<boolean> {
    this.setMockStatus('noPaper');
    // The ballot has left the machine into the ballot box, so any printed
    // contents are gone. Clearing them ensures a subsequently loaded blank
    // sheet scans as blank rather than re-reading the cast ballot.
    this.mockPaperContents = undefined;

    return Promise.resolve(true);
  }

  // @coverage-defer
  calibrate(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  enablePrint(): Promise<boolean> {
    return Promise.resolve(true);
  }

  // @coverage-defer
  disablePrint(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  setMotionUnits(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  setLeftMargin(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  setPrintingAreaWidth(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  setLineSpacing(numMotionUnits: number): Promise<USBOutTransferResult> {
    debug('setLineSpacing called with numMotionUnits: %d', numMotionUnits);
    return Promise.resolve(makeUsbOutTransferResult('ok', 0));
  }

  // @coverage-defer
  setPrintingSpeed(
    printingSpeed: PrintingSpeed
  ): Promise<USBOutTransferResult> {
    debug('setPrintingSpeed called with printingSpeed: %s', printingSpeed);
    return Promise.resolve(makeUsbOutTransferResult('ok', 0));
  }

  // @coverage-defer
  setPrintingDensity(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  setAbsolutePrintPosition(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  setRelativePrintPosition(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  setRelativeVerticalPrintPosition(): Promise<USBOutTransferResult> {
    return Promise.resolve(makeUsbOutTransferResult('ok', 1));
  }

  // @coverage-defer
  bufferChunk(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  // @coverage-defer
  printChunk(): Promise<void> {
    return Promise.resolve();
  }

  // @coverage-defer
  print(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  //
  // Mock Helpers:
  //

  getMockStatus(): MockPaperHandlerStatus {
    return this.mockStatus;
  }

  setMockStatus(mockStatus: MockPaperHandlerStatus): void {
    this.mockStatus = mockStatus;
    this.statusRef = {
      ...MOCK_STATUSES_DEFINITIONS[mockStatus],
      optoSensor: this.coverOpen,
    };
  }

  setMockPaperContents(contents?: ImageData): void {
    this.mockPaperContents = contents;
  }

  // @coverage-defer
  isCoverOpen(): boolean {
    return this.coverOpen;
  }

  // @coverage-defer
  setCoverOpen(isOpen: boolean): void {
    this.coverOpen = isOpen;
    this.setMockStatus(this.mockStatus);
  }
}

export function isMockPaperHandler(
  driver?: PaperHandlerDriverInterface
): driver is MockPaperHandlerDriver {
  return driver instanceof MockPaperHandlerDriver;
}
