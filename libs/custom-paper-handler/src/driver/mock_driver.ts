import { Result, sleep } from '@votingworks/basics';
import { CoderError } from '@votingworks/message-coder';
import makeDebug from 'debug';
import { ImageData, writeImageData } from '@votingworks/image-utils';
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

const EMPTY_PAGE_CONTENTS = new ImageData(
  new Uint8ClampedArray([1, 2, 3, 4]),
  2
);

export class MockPaperHandlerDriver implements PaperHandlerDriverInterface {
  private statusRef: PaperHandlerStatus = defaultPaperHandlerStatus();
  private mockStatus: MockPaperHandlerStatus = 'noPaper';
  private mockPaperContents?: ImageData;

  constructor() {
    this.setMockStatus('noPaper');
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
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

  transferOutRealTime(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  transferInRealTime(): Promise<USBInTransferResult> {
    throw new Error('Method not implemented.');
  }

  handleRealTimeExchange(): Promise<Result<never, CoderError>> {
    throw new Error('Method not implemented.');
  }

  transferOutGeneric(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  initializePrinter(): Promise<void> {
    debug('initializePrinter called');
    return Promise.resolve();
  }

  validateRealTimeExchangeResponse(): void {
    throw new Error('Method not implemented.');
  }

  getScannerStatus(): Promise<SensorStatusRealTimeExchangeResponse> {
    throw new Error('Method not implemented.');
  }

  getPrinterStatus(): Promise<PrinterStatusRealTimeExchangeResponse> {
    throw new Error('Method not implemented.');
  }

  async abortScan(): Promise<void> {
    await sleep(500);
  }

  async resetScan(): Promise<void> {
    await sleep(500);
  }

  getPaperHandlerStatus(): Promise<PaperHandlerStatus> {
    return Promise.resolve(this.statusRef);
  }

  handleGenericCommandWithAcknowledgement(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  getScannerCapability(): Promise<ScannerCapability> {
    throw new Error('Method not implemented.');
  }

  syncScannerConfig(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  setScanLight(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  setScanDataFormat(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  setScanResolution(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  setPaperMovementAfterScan(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  setScanDirection(): Promise<boolean> {
    return Promise.resolve(true);
  }

  scan(): Promise<ImageData> {
    return Promise.resolve(this.mockPaperContents || EMPTY_PAGE_CONTENTS);
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

    return Promise.resolve(true);
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

  setMotionUnits(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  setLeftMargin(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  setPrintingAreaWidth(): Promise<USBOutTransferResult> {
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

  setPrintingDensity(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  setAbsolutePrintPosition(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  setRelativePrintPosition(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  setRelativeVerticalPrintPosition(): Promise<USBOutTransferResult> {
    return Promise.resolve(makeUsbOutTransferResult('ok', 1));
  }

  bufferChunk(): Promise<USBOutTransferResult> {
    throw new Error('Method not implemented.');
  }

  printChunk(): Promise<void> {
    return Promise.resolve();
  }

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
    this.statusRef = MOCK_STATUSES_DEFINITIONS[mockStatus];
  }

  setMockPaperContents(contents?: ImageData): void {
    this.mockPaperContents = contents;
  }
}

export function isMockPaperHandler(
  driver?: PaperHandlerDriverInterface
): driver is MockPaperHandlerDriver {
  return driver instanceof MockPaperHandlerDriver;
}
