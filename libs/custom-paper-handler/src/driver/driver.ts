import { findByIds, WebUSBDevice } from 'usb';
import makeDebug from 'debug';
import { assert, Optional, sleep } from '@votingworks/basics';
import { Buffer } from 'buffer';
import {
  assertNumberIsInRangeInclusive,
  assertUint16,
  isUint8,
  Uint16,
  Uint16Max,
  Uint16toUint8,
  Uint8,
} from '../bits';
import { Lock } from './lock';
import {
  PaperHandlerStatus,
  parsePrinterStatus,
  parseScannerStatus,
  PrinterStatus,
  ScannerStatus,
} from './sensors';
import {
  parseScannerCapability,
  ScannerCapability,
} from './scanner_capability';
import {
  getDefaultConfig,
  encodeScannerConfig,
  PaperMovementAfterScan,
  Resolution,
  ScanDataFormat,
  ScanDirection,
  ScanLight,
  ScannerConfig,
} from './scanner_config';

const serverDebug = makeDebug('paper-handler:driver');

function debug(message: string) {
  serverDebug(message);
  /* eslint-disable-next-line no-console */
  console.log(message);
}

/**
 * USB commands are a series of byte values
 */
export type Command = Uint8[];

export type PrintingSpeed = 'slow' | 'normal' | 'fast';
const PRINTING_SPEED_CODES: Record<PrintingSpeed, Uint8> = {
  slow: 0,
  normal: 1,
  fast: 2,
};

export type PrintingDensity = '-25%' | '-12.5%' | 'default' | '+12.5%' | '+25%';
const PRINTING_DENSITY_CODES: Record<PrintingDensity, Uint8> = {
  '-25%': 0x02,
  '-12.5%': 0x03,
  default: 0x04,
  '+12.5%': 0x05,
  '+25%': 0x06,
};

export interface PaperHandlerBitmap {
  data: Uint8Array;
  width: number;
}

// USB Interface Information
const VENDOR_ID = 0x0dd4;
const PRODUCT_ID = 0x4105;
const CONFIGURATION_NUMBER = 1; // TODO verify this against manual/hardware
// Disable no-unused-vars until this file is cleaned up
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
const INTERFACE_NUMBER = 0;
export const GENERIC_ENDPOINT_IN = 1;
export const GENERIC_ENDPOINT_OUT = 2;
export const REAL_TIME_ENDPOINT_IN = 3;
export const REAL_TIME_ENDPOINT_OUT = 4;
export const PACKET_SIZE = 65536;

// Common Bytes
const START_OF_PACKET: Uint8 = 0x02;
const NULL_CODE: Uint8 = 0x00;
const TOKEN: Uint8 = 0x01;

// Return Codes
export enum ReturnCodes {
  POSITIVE_ACKNOWLEDGEMENT = 0x06,
  NEGATIVE_ACKNOWLEDGEMENT = 0x15,
}

export enum RealTimeRequestIds {
  SCANNER_COMPLETE_STATUS_REQUEST_ID = 0x73,
  PRINTER_STATUS_REQUEST_ID = 0x64,
  SCAN_ABORT_REQUEST_ID = 0x43,
  SCAN_RESET_REQUEST_ID = 0x52,
}

// Generic Commands
const GET_SCANNER_CAPABILITY: Command = [0x1c, 0x53, 0x43, 0x47];
const SET_SCANNER_CONFIG: Command = [0x1c, 0x53, 0x50, 0x43];
const SCAN: Command = [0x1c, 0x53, 0x50, 0x53];

// Ongoing Scan Status
const OK_CONTINUE: Uint8 = 0x00;
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
const OK_DONE: Uint8 = 0xff;
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
const SCAN_ABORTED: Uint8 = 0x41;
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
const SCANNER_BUSY: Uint8 = 0x42;
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
const COVER_OPEN: Uint8 = 0x43;
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
const PAPER_JAM: Uint8 = 0x4a;
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
const TIMEOUT: Uint8 = 0x54;
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
const DOUBLE_SHEET_DETECTED: Uint8 = 0x55;

const LOAD_PAPER: Command = [0x1c, 0x53, 0x50, 0x4c];
const PARK_PAPER: Command = [0x1c, 0x53, 0x50, 0x50];
const EJECT_PAPER: Command = [0x1c, 0x53, 0x50, 0x45];
const PRESENT_PAPER_AND_HOLD: Command = [0x1c, 0x53, 0x50, 0x46];
const EJECT_PAPER_TO_BALLOT: Command = [0x1c, 0x53, 0x50, 0x48];

const SCANNER_CALIBRATION: Command = [0x1f, 0x43];

const ENABLE_PRINT: Command = [0x1f, 0x45];
const DISABLE_PRINT: Command = [0x1f, 0x65];
const INITIALIZE_DEVICE: Command = [0x1b, 0x40];
const PRINT_AND_FEED_PAPER: Command = [0x1b, 0x4a];
const SELECT_IMAGE_PRINT_MODE: Command = [0x1b, 0x2a];
const SET_ABSOLUTE_PRINT_POSITION: Command = [0x1b, 0x24];
const SET_RELATIVE_PRINT_POSITION: Command = [0x1b, 0x5c];
const SET_RELATIVE_VERTICAL_PRINT_POSITION: Command = [0x1b, 0x28, 0x76];
const SET_LEFT_MARGIN: Command = [0x1d, 0x4c];
const SET_PRINTING_AREA_WIDTH: Command = [0x1d, 0x57];
const SET_PRINTING_DENSITY: Command = [0x1d, 0x7c];
const SET_PRINTING_SPEED: Command = [0x1d, 0xf0];
const SET_MOTION_UNITS: Command = [0x1d, 0x50];
const SET_FINE_MOTION_UNITS: Command = [0x1d, 0xd0];
const SET_LINE_SPACING: Command = [0x1b, 0x33];

export async function getPaperHandlerWebDevice(): Promise<
  Optional<WebUSBDevice>
> {
  debug('checking for paper handler...');
  const legacyDevice = findByIds(VENDOR_ID, PRODUCT_ID);
  if (!legacyDevice) {
    debug('no paper handler found');
    return;
  }
  debug('paper handler found');

  try {
    const webDevice = await WebUSBDevice.createInstance(legacyDevice);
    return webDevice;
  } catch (e) {
    const error = e as Error;
    throw new Error(
      `Error initializing WebUSBDevice with message: ${error.message}`
    );
  }
}

// Not all WebUSbDevice methods are implemented in the mock
export type MinimalWebUsbDevice = Pick<
  WebUSBDevice,
  | 'open'
  | 'close'
  | 'transferOut'
  | 'transferIn'
  | 'claimInterface'
  | 'selectConfiguration'
>;

export class PaperHandlerDriver {
  private readonly genericLock = new Lock();
  private readonly realTimeLock = new Lock();
  private readonly scannerConfig: ScannerConfig = getDefaultConfig();

  constructor(private readonly webDevice: MinimalWebUsbDevice) {}

  async connect(): Promise<void> {
    await this.webDevice.open();
    debug('opened web device');
    await this.webDevice.selectConfiguration(CONFIGURATION_NUMBER);
    debug(`selected configuration ${CONFIGURATION_NUMBER}`);
    await this.webDevice.claimInterface(INTERFACE_NUMBER);
    debug(`claimed usb interface ${INTERFACE_NUMBER}`);
  }

  async disconnect(): Promise<void> {
    // closing the web device will fail if we have pending requests, so wait for them
    await this.genericLock.acquire();
    this.genericLock.release();
    await this.realTimeLock.acquire();
    this.realTimeLock.release();

    // await this.webDevice.releaseInterface(0);
    // debug('released usb interface');
    await this.webDevice.close();
    debug('closed web usb device');
  }

  /**
   * Should be private, but exposed for development.
   */
  getWebDevice(): MinimalWebUsbDevice {
    return this.webDevice;
  }

  /**
   * Send commands or data on the generic bulk out endpoint.
   */
  transferOutGeneric(
    data: Uint8[] | Uint8Array | Buffer
  ): Promise<USBOutTransferResult> {
    return this.webDevice.transferOut(
      GENERIC_ENDPOINT_OUT,
      Array.isArray(data) ? new Uint8Array(data) : data
    );
  }

  /**
   * Receive data or command responses on the generic bulk in endpoint.
   */
  transferInGeneric(): Promise<USBInTransferResult> {
    return this.webDevice.transferIn(GENERIC_ENDPOINT_IN, PACKET_SIZE);
  }

  async clearGenericInBuffer(): Promise<void> {
    let bufferClear = false;
    let i = -1;
    while (!bufferClear) {
      bufferClear = await Promise.race([
        sleep(1000).then(() => {
          return true;
        }),
        this.transferInGeneric().then(() => {
          return false;
        }),
      ]);
      i += 1;
    }
    debug(`${i} packets cleared`);
  }

  /**
   * Transfers data out on the real time bulk out endpoint.
   */
  transferOutRealTime(command: Uint8[]): Promise<USBOutTransferResult> {
    return this.webDevice.transferOut(
      REAL_TIME_ENDPOINT_OUT,
      new Uint8Array(command)
    );
  }

  /**
   * Receives data from the real time bulk in endpoint.
   */
  transferInRealTime(): Promise<USBInTransferResult> {
    return this.webDevice.transferIn(REAL_TIME_ENDPOINT_IN, PACKET_SIZE);
  }

  async handleRealTimeExchange(requestId: Uint8): Promise<DataView> {
    await this.realTimeLock.acquire();

    const transferOutResult = await this.transferOutRealTime([
      START_OF_PACKET,
      requestId,
      TOKEN,
      NULL_CODE,
    ]);
    assert(transferOutResult.status === 'ok'); // TODO: handling

    const transferInResult = await this.transferInRealTime();
    this.realTimeLock.release();
    assert(transferInResult.status === 'ok'); // TODO: handling

    const { data } = transferInResult;
    assert(data);
    assert(data.getUint8(1) === requestId);
    assert(data.getUint8(3) === ReturnCodes.POSITIVE_ACKNOWLEDGEMENT); // TODO: handling
    return data;
  }

  /**
   * Requests, receives, and parses the complete scanner status bitmask.
   *
   * @returns {ScannerStatus}
   */
  async getScannerStatus(): Promise<ScannerStatus> {
    return parseScannerStatus(
      await this.handleRealTimeExchange(
        RealTimeRequestIds.SCANNER_COMPLETE_STATUS_REQUEST_ID
      )
    );
  }

  /**
   * Requests, receives, and parses the printer status bitmask.
   *
   * @returns {PrinterStatus}
   */
  async getPrinterStatus(): Promise<PrinterStatus> {
    return parsePrinterStatus(
      await this.handleRealTimeExchange(
        RealTimeRequestIds.PRINTER_STATUS_REQUEST_ID
      )
    );
  }

  async abortScan(): Promise<void> {
    await this.handleRealTimeExchange(RealTimeRequestIds.SCAN_ABORT_REQUEST_ID);
  }

  // reset scan reconnects the scanenr, changes the device address, and requires a new WebUSBDevice
  async resetScan(): Promise<void> {
    await this.handleRealTimeExchange(RealTimeRequestIds.SCAN_RESET_REQUEST_ID);
  }

  /**
   * Does not map to a single command, but is useful for testing
   * @returns {PaperHandlerStatus}
   */
  async getPaperHandlerStatus(): Promise<PaperHandlerStatus> {
    const printerStatus = await this.getPrinterStatus();
    const scannerStatus = await this.getScannerStatus();
    return {
      ...scannerStatus,
      ...printerStatus,
    };
  }

  /**
   * Sends command to generic endpoint and receives acknowledgement. Returns
   * true for positive acknowledgement and false for negative acknowledgement.
   */
  async handleGenericCommandWithAcknowledgement(
    command: Command
  ): Promise<boolean> {
    debug(`sending generic command: ${command}`);
    await this.genericLock.acquire();
    const transferOutResult = await this.transferOutGeneric(command);
    assert(transferOutResult.status === 'ok'); // TODO: Handling

    debug(`waiting for generic transfer in: ${command}`);
    const transferInResult = await this.transferInGeneric();
    assert(transferInResult.status === 'ok'); // TODO: Handling
    this.genericLock.release();
    debug(`transfer in status: ${transferInResult.status}`);
    const code = transferInResult.data?.getUint8(0);
    switch (code) {
      case ReturnCodes.POSITIVE_ACKNOWLEDGEMENT:
        debug('positive acknowledgement');
        return true;
      case ReturnCodes.NEGATIVE_ACKNOWLEDGEMENT:
        debug('negative acknowledgement');
        return false;
      default:
        throw new Error(`uninterpretable acknowledgement: ${code}`);
    }
  }

  async getScannerCapability(): Promise<ScannerCapability> {
    await this.genericLock.acquire();
    await this.transferOutGeneric(GET_SCANNER_CAPABILITY);
    const transferInResult = await this.transferInGeneric();
    const { data } = transferInResult;
    assert(data);
    return parseScannerCapability(data);
  }

  async syncScannerConfig(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement([
      ...SET_SCANNER_CONFIG,
      ...encodeScannerConfig(this.scannerConfig),
    ]);
  }

  async setScanLight(scanLight: ScanLight): Promise<boolean> {
    this.scannerConfig.scanLight = scanLight;
    return this.syncScannerConfig();
  }

  async setScanDataFormat(scanDataFormat: ScanDataFormat): Promise<boolean> {
    this.scannerConfig.scanDataFormat = scanDataFormat;
    return this.syncScannerConfig();
  }

  async setScanResolution({
    horizontalResolution,
    verticalResolution,
  }: {
    horizontalResolution: Resolution;
    verticalResolution: Resolution;
  }): Promise<boolean> {
    this.scannerConfig.horizontalResolution = horizontalResolution;
    this.scannerConfig.verticalResolution = verticalResolution;
    return this.syncScannerConfig();
  }

  async setPaperMovementAfterScan(
    paperMovementAfterScan: PaperMovementAfterScan
  ): Promise<boolean> {
    this.scannerConfig.paperMovementAfterScan = paperMovementAfterScan;
    return this.syncScannerConfig();
  }

  async setScanDirection(scanDirection: ScanDirection): Promise<boolean> {
    this.scannerConfig.scanDirection = scanDirection;
    return this.syncScannerConfig();
  }

  async scan(): Promise<Uint8Array> {
    await this.genericLock.acquire();
    await this.transferOutGeneric(SCAN);
    debug('STARTING SCAN');
    let scanStatus = OK_CONTINUE;
    const imageData: Uint8Array[] = [];

    while (scanStatus === OK_CONTINUE) {
      const { data: header } = await this.transferInGeneric();
      assert(header);
      scanStatus = header.getUint8(3) as Uint8;
      const sizeX = header.getUint16(6);
      const sizeY = header.getUint16(8);
      const pixelsPerByte = header.getUint8(5) <= 5 ? 1 : 8;

      const dataBlockByteLength = (sizeX * sizeY) / pixelsPerByte;
      imageData.push(new Uint8Array(header.buffer.slice(16)));

      let dataBlockBytesReceived = header.buffer.byteLength - 16;
      while (dataBlockBytesReceived < dataBlockByteLength) {
        debug('Additional data...');
        const { data } = await this.transferInGeneric();
        assert(data);
        debug(`${data.byteLength}`);
        imageData.push(new Uint8Array(data.buffer));
        dataBlockBytesReceived += data.byteLength;
      }
    }
    this.genericLock.release();
    debug('ALL BLOCKS RECEIVED');
    return Buffer.concat(imageData);
  }

  /**
   * Loading means pulling the paper in a couple of inches. Handler will always
   * attempt to pull paper in. if none is pulled in, command still returns positive.
   */
  async loadPaper(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(LOAD_PAPER);
  }

  /**
   * Ejects out the front. Can eject from loaded or parked state. If there is
   * no paper to eject, handler will do nothing and return positive acknowledgement.
   */
  async ejectPaper(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(EJECT_PAPER);
  }

  /**
   * Parks paper inside the handler. If there is no paper to park, returns
   * negative acknowledgement.If paper already parked, does nothing and returns
   * positive acknowledgement. When parked, parkSensor should be true.
   */
  async parkPaper(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(PARK_PAPER);
  }

  /**
   * Moves paper to the front for voter to see, but hangs on to the paper.
   * Equivalent to "reject hold." How do we differentiate the present paper
   * state from the state where paper has not been picked up yet?
   */
  presentPaper(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(PRESENT_PAPER_AND_HOLD);
  }

  /**
   * Ejects to ballot box. Can eject from loaded or parked state. If there is
   * no paper to eject, handler will do nothing and return positive acknowledgement.
   */
  async ejectBallot(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(EJECT_PAPER_TO_BALLOT);
  }

  calibrate(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(SCANNER_CALIBRATION);
  }

  /**
   * Moves paper to print position and moves print head to DOWN position. If
   * paper is already in an appropriate print position, does not move paper.
   * E.g. if paper is loaded, it will pull the paper in a few more inches, but
   * if the paper is parked, it will not move the paper. Printing can start in
   * a variety of positions.
   */
  enablePrint(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(ENABLE_PRINT);
  }

  /**
   * Moves print head to UP position, does not move paper
   */
  disablePrint(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(DISABLE_PRINT);
  }

  /**
   * According to manual, "Clears the data in the print buffer and resets the
   * device mode to that in effect when power was turned on." It is called
   * initialize device but it appears to actually just initialize the printer.
   */
  async initializePrinter(): Promise<void> {
    await this.transferOutGeneric(INITIALIZE_DEVICE);
  }

  async setMotionUnits(x: number, y: number): Promise<USBOutTransferResult> {
    assertNumberIsInRangeInclusive(x, 0, 2040);
    assertNumberIsInRangeInclusive(y, 0, 4080);

    if (isUint8(x) && isUint8(y)) {
      return this.transferOutGeneric([...SET_MOTION_UNITS, x, y]);
    }

    // the below is not working, not actually changing the motion units

    const [xH, xL] = Uint16toUint8(x);
    const [yH, yL] = Uint16toUint8(y);

    const command = [...SET_FINE_MOTION_UNITS, xH, xL, yH, yL];
    debug(`issuing command: ${command}`);
    return this.transferOutGeneric(command);
  }

  async setLeftMargin(numMotionUnits: Uint16): Promise<USBOutTransferResult> {
    assertUint16(numMotionUnits);
    const [nH, nL] = Uint16toUint8(numMotionUnits);
    return this.transferOutGeneric([...SET_LEFT_MARGIN, nL, nH]);
  }

  /**
   * Setting the printing area width to 0 results in setting it to the maximum,
   * which is usually what we want.
   */
  async setPrintingAreaWidth(
    numMotionUnits: Uint16 = 0
  ): Promise<USBOutTransferResult> {
    assertNumberIsInRangeInclusive(numMotionUnits, 0, 1600);
    const [nH, nL] = Uint16toUint8(numMotionUnits);
    return this.transferOutGeneric([...SET_PRINTING_AREA_WIDTH, nL, nH]);
  }

  async setLineSpacing(numMotionUnits: Uint8): Promise<USBOutTransferResult> {
    return this.transferOutGeneric([...SET_LINE_SPACING, numMotionUnits]);
  }

  async setPrintingSpeed(
    printingSpeed: PrintingSpeed
  ): Promise<USBOutTransferResult> {
    return this.transferOutGeneric([
      ...SET_PRINTING_SPEED,
      PRINTING_SPEED_CODES[printingSpeed],
    ]);
  }

  async setPrintingDensity(
    printingDensity: PrintingDensity
  ): Promise<USBOutTransferResult> {
    return this.transferOutGeneric([
      ...SET_PRINTING_DENSITY,
      PRINTING_DENSITY_CODES[printingDensity],
    ]);
  }

  async setAbsolutePrintPosition(
    numMotionUnits: Uint16
  ): Promise<USBOutTransferResult> {
    assertUint16(numMotionUnits);
    const [nH, nL] = Uint16toUint8(numMotionUnits);
    return this.transferOutGeneric([...SET_ABSOLUTE_PRINT_POSITION, nL, nH]);
  }

  async setRelativePrintPosition(
    numMotionUnits: number
  ): Promise<USBOutTransferResult> {
    assertNumberIsInRangeInclusive(numMotionUnits, -32768, 32867);
    const unsignedNumMotionUnits: Uint16 =
      numMotionUnits < 0 ? Uint16Max + 1 - numMotionUnits : numMotionUnits;
    const [nH, nL] = Uint16toUint8(unsignedNumMotionUnits);
    return this.transferOutGeneric([...SET_RELATIVE_PRINT_POSITION, nL, nH]);
  }

  async setRelativeVerticalPrintPosition(
    numMotionUnits: number
  ): Promise<USBOutTransferResult> {
    assertNumberIsInRangeInclusive(numMotionUnits, -32768, 32867);
    const unsignedNumMotionUnits: Uint16 =
      numMotionUnits < 0 ? Uint16Max + 1 + numMotionUnits : numMotionUnits;
    const [nH, nL] = Uint16toUint8(unsignedNumMotionUnits);
    return this.transferOutGeneric([
      ...SET_RELATIVE_VERTICAL_PRINT_POSITION,
      nL,
      nH,
    ]);
  }

  async bufferChunk(
    chunkedCustomBitmap: PaperHandlerBitmap
  ): Promise<USBOutTransferResult> {
    if (chunkedCustomBitmap.width >= 1024) {
      throw new Error('can only buffer chunks of width 1024 at a time');
    }

    const [nH, nL] = Uint16toUint8(chunkedCustomBitmap.width);

    return this.transferOutGeneric(
      new Uint8Array([
        ...SELECT_IMAGE_PRINT_MODE,
        33 as Uint8,
        nL,
        nH,
        ...chunkedCustomBitmap.data,
      ])
    );
  }

  async printChunk(chunkedCustomBitmap: PaperHandlerBitmap): Promise<void> {
    assert(chunkedCustomBitmap.width * 3 === chunkedCustomBitmap.data.length);
    assert(chunkedCustomBitmap.width <= 1600); // max width

    // In this case, we can send all data at once
    if (chunkedCustomBitmap.width < 1024) {
      await this.bufferChunk(chunkedCustomBitmap);
      await this.print();
      return;
    }

    // If chunk is 1024 dots wide or longer, have to buffer as two images
    const leftChunk: PaperHandlerBitmap = {
      width: 800,
      data: chunkedCustomBitmap.data.slice(0, 800 * 3),
    };

    const rightChunk: PaperHandlerBitmap = {
      width: chunkedCustomBitmap.width - 800,
      data: chunkedCustomBitmap.data.slice(800 * 3),
    };

    await this.bufferChunk(leftChunk);
    await this.bufferChunk(rightChunk);

    // the machine will have automatically printed if we've buffered a full
    // line worth of data. If we have buffered less, we need to call print
    if (chunkedCustomBitmap.width < 1600) {
      await this.print();
    }
  }

  /**
   *
   * @param numMotionUnitsToFeedPaper Assuming you are operating in standard mode, the vertical motion unit will
   * be used.
   */
  async print(numMotionUnitsToFeedPaper: Uint8 = 0): Promise<void> {
    const command = [...PRINT_AND_FEED_PAPER, numMotionUnitsToFeedPaper];
    await this.transferOutGeneric(command);
  }
}

export async function getPaperHandlerDriver(): Promise<
  Optional<PaperHandlerDriver>
> {
  const paperHandlerWebDevice = await getPaperHandlerWebDevice();
  if (!paperHandlerWebDevice) return;

  const paperHandlerDriver = new PaperHandlerDriver(paperHandlerWebDevice);
  await paperHandlerDriver.connect();
  return paperHandlerDriver;
}
