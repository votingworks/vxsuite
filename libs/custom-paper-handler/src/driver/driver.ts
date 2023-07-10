import { findByIds, WebUSBDevice } from 'usb';
import makeDebug from 'debug';
import { assert, Optional, Result, sleep } from '@votingworks/basics';
import { Buffer } from 'buffer';
import {
  byteArray,
  Coder,
  CoderError,
  CoderType,
  literal,
  message,
  padding,
  uint8,
} from '@votingworks/message-coder';
import { createImageData } from '@votingworks/image-utils';
import {
  assertNumberIsInRangeInclusive,
  assertUint16,
  Uint16,
  Uint16toUint8,
  Uint8,
} from '../bits';
import { Lock } from './lock';
import {
  parseScannerCapability,
  ScannerCapability,
} from './scanner_capability';
import {
  getDefaultConfig,
  getScannerConfigCoderValues,
  PaperMovementAfterScan,
  Resolution,
  ScanDataFormat,
  ScanDirection,
  ScanLight,
  ScannerConfig,
} from './scanner_config';
import {
  DEVICE_MAX_WIDTH_DOTS,
  INT_16_MAX,
  INT_16_MIN,
  OK_CONTINUE,
  PrintModeDotDensity,
  SCAN_HEADER_LENGTH_BYTES,
  START_OF_PACKET,
  TOKEN,
  UINT_16_MAX,
} from './constants';
import {
  AcknowledgementResponse,
  ConfigureScannerCommand,
  DisablePrintCommand,
  EjectPaperCommand,
  EjectPaperToBallotCommand,
  EnablePrintCommand,
  GetScannerCapabilityCommand,
  InitializeRequestCommand,
  LoadPaperCommand,
  ParkPaperCommand,
  PresentPaperAndHoldCommand,
  PrintAndFeedPaperCommand,
  PrinterStatusRealTimeExchangeResponse,
  RealTimeExchangeResponseWithoutData,
  ScanCommand,
  ScannerCalibrationCommand,
  ScanResponse,
  SensorStatusRealTimeExchangeResponse,
  SetAbsolutePrintPositionCommand,
  SetLeftMarginCommand,
  SetLineSpacingCommand,
  SetMotionUnitsCommand,
  SetPrintingAreaWidthCommand,
  SetPrintingDensityCommand,
  SetPrintingSpeedCommand,
  SetRelativePrintPositionCommand,
  SetRelativeVerticalPrintPositionCommand,
} from './coders';

const serverDebug = makeDebug('custom-paper-handler:driver');

function debug(msg: string, prefix?: string) {
  const fullMsg = prefix ? `[${prefix}] ${msg}` : msg;
  serverDebug(fullMsg);
}

const TransferOutRealTimeRequest = message({
  stx: literal(START_OF_PACKET),
  requestId: uint8(),
  token: literal(TOKEN),
  // Treat "optional data length" byte as padding when no additional data is supplied
  padding: padding(8),
});
type TransferOutRealTimeRequest = CoderType<typeof TransferOutRealTimeRequest>;

export type PaperHandlerStatus = SensorStatusRealTimeExchangeResponse &
  PrinterStatusRealTimeExchangeResponse;

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
const INTERFACE_NUMBER = 0;
export const GENERIC_ENDPOINT_IN = 1;
export const GENERIC_ENDPOINT_OUT = 2;
export const REAL_TIME_ENDPOINT_IN = 3;
export const REAL_TIME_ENDPOINT_OUT = 4;
export const PACKET_SIZE = 65536;

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
  transferOutRealTime(requestId: Uint8): Promise<USBOutTransferResult> {
    const buf = TransferOutRealTimeRequest.encode({
      requestId,
    }).unsafeUnwrap();
    return this.webDevice.transferOut(REAL_TIME_ENDPOINT_OUT, buf);
  }

  /**
   * Receives data from the real time bulk in endpoint.
   */
  transferInRealTime(): Promise<USBInTransferResult> {
    return this.webDevice.transferIn(REAL_TIME_ENDPOINT_IN, PACKET_SIZE);
  }

  async handleRealTimeExchange<T>(
    requestId: RealTimeRequestIds,
    coder: Coder<T>
    // According to the manual, "REAL-TIME USB PROTOCOL FORMAT" supports transferring out optional data.
    // The prototype doesn't support it, so leave out support from this function until needed.
  ): Promise<Result<T, CoderError>> {
    await this.realTimeLock.acquire();

    const transferOutResult = await this.transferOutRealTime(requestId);
    assert(transferOutResult.status === 'ok'); // TODO: handling

    const transferInResult = await this.transferInRealTime();
    this.realTimeLock.release();
    assert(transferInResult.status === 'ok'); // TODO: handling

    const { data } = transferInResult;
    assert(data);
    return coder.decode(Buffer.from(data.buffer));
  }

  /**
   * Send commands or data on the generic bulk out endpoint.
   */
  transferOutGeneric<T>(
    coder: Coder<T>,
    value: T
  ): Promise<USBOutTransferResult> {
    const encodeResult = coder.encode(value);
    if (encodeResult.isErr()) {
      // TODO handle this more gracefully
      debug(
        `Error attempting transferOutGeneric with coder value ${value}: ${encodeResult.err()}`
      );
      throw new Error(encodeResult.err());
    }
    const data = encodeResult.unsafeUnwrap();
    return this.webDevice.transferOut(GENERIC_ENDPOINT_OUT, data);
  }

  /**
   * According to manual, "Clears the data in the print buffer and resets the
   * device mode to that in effect when power was turned on." It is called
   * initialize device but it appears to actually just initialize the printer.
   */
  async initializePrinter(): Promise<void> {
    await this.transferOutGeneric(InitializeRequestCommand, undefined);
  }

  validateRealTimeExchangeResponse(
    expectedRequestId: RealTimeRequestIds,
    response:
      | SensorStatusRealTimeExchangeResponse
      | PrinterStatusRealTimeExchangeResponse
      | RealTimeExchangeResponseWithoutData
  ): void {
    assert(response.requestId === expectedRequestId);
    assert(response.returnCode === ReturnCodes.POSITIVE_ACKNOWLEDGEMENT);
  }

  /**
   * Requests, receives, and parses the complete scanner status bitmask.
   *
   * @returns {ScannerStatus}
   */
  async getScannerStatus(): Promise<SensorStatusRealTimeExchangeResponse> {
    const response = (
      await this.handleRealTimeExchange(
        RealTimeRequestIds.SCANNER_COMPLETE_STATUS_REQUEST_ID,
        SensorStatusRealTimeExchangeResponse
      )
    ).unsafeUnwrap();
    this.validateRealTimeExchangeResponse(
      RealTimeRequestIds.SCANNER_COMPLETE_STATUS_REQUEST_ID,
      response
    );
    return response;
  }

  /**
   * Requests, receives, and parses the printer status bitmask.
   *
   * @returns {PrinterStatus}
   */
  async getPrinterStatus(): Promise<PrinterStatusRealTimeExchangeResponse> {
    const response = (
      await this.handleRealTimeExchange(
        RealTimeRequestIds.PRINTER_STATUS_REQUEST_ID,
        PrinterStatusRealTimeExchangeResponse
      )
    ).unsafeUnwrap();
    this.validateRealTimeExchangeResponse(
      RealTimeRequestIds.PRINTER_STATUS_REQUEST_ID,
      response
    );
    return response;
  }

  async abortScan(): Promise<void> {
    const response = (
      await this.handleRealTimeExchange(
        RealTimeRequestIds.SCAN_ABORT_REQUEST_ID,
        RealTimeExchangeResponseWithoutData
      )
    ).unsafeUnwrap();
    this.validateRealTimeExchangeResponse(
      RealTimeRequestIds.SCAN_ABORT_REQUEST_ID,
      response
    );
  }

  // reset scan reconnects the scanner, changes the device address, and requires a new WebUSBDevice
  async resetScan(): Promise<void> {
    const response = (
      await this.handleRealTimeExchange(
        RealTimeRequestIds.SCAN_RESET_REQUEST_ID,
        RealTimeExchangeResponseWithoutData
      )
    ).unsafeUnwrap();
    this.validateRealTimeExchangeResponse(
      RealTimeRequestIds.SCAN_RESET_REQUEST_ID,
      response
    );
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
  async handleGenericCommandWithAcknowledgement<T>(
    coder: Coder<T>,
    value: T
  ): Promise<boolean> {
    debug('acquiring lock');
    await this.genericLock.acquire();
    const transferOutResult = await this.transferOutGeneric(coder, value);
    assert(transferOutResult.status === 'ok'); // TODO: Handling

    const transferInResult = await this.transferInGeneric();
    assert(transferInResult.status === 'ok'); // TODO: Handling
    this.genericLock.release();
    const { data } = transferInResult;
    assert(data);
    const result = AcknowledgementResponse.decode(Buffer.from(data.buffer));
    if (result.isErr()) {
      debug(`Error decoding transferInGeneric response: ${result.err()}`);
      return false;
    }
    const code = result.ok();
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
    await this.transferOutGeneric(GetScannerCapabilityCommand, undefined);
    const transferInResult = await this.transferInGeneric();
    const { data } = transferInResult;
    assert(data);
    return parseScannerCapability(data);
  }

  async syncScannerConfig(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(
      ConfigureScannerCommand,
      getScannerConfigCoderValues(this.scannerConfig)
    );
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

  async scan(): Promise<ImageData> {
    await this.genericLock.acquire();
    await this.transferOutGeneric(ScanCommand, undefined);
    debug('STARTING SCAN');
    let scanStatus = OK_CONTINUE;
    const imageData: Uint8Array[] = [];

    while (scanStatus === OK_CONTINUE) {
      const rawResponse = await this.transferInGeneric();
      assert(rawResponse?.data);

      const responseBuffer = rawResponse.data.buffer;

      const header = responseBuffer.slice(0, SCAN_HEADER_LENGTH_BYTES);
      const response: ScanResponse = ScanResponse.decode(
        Buffer.from(header)
      ).unsafeUnwrap();

      scanStatus = response.returnCode;
      const { sizeX, sizeY } = response;
      const pixelsPerByte = response.scan <= 5 ? 1 : 8;
      debug(`sizeX: ${sizeX}, sizeY: ${sizeY}, ppb: ${pixelsPerByte}`);

      const dataBlockByteLength = (sizeX * sizeY) / pixelsPerByte;
      imageData.push(
        new Uint8Array(responseBuffer.slice(SCAN_HEADER_LENGTH_BYTES))
      );

      let dataBlockBytesReceived = responseBuffer.byteLength - 16;
      debug(
        `initial ${dataBlockBytesReceived} bytes received. Expecting ${dataBlockByteLength}`
      );

      while (dataBlockBytesReceived < dataBlockByteLength) {
        debug(
          `${dataBlockBytesReceived} bytes received. Expecting ${dataBlockByteLength}`
        );
        await sleep(1000);
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
    return createImageData(
      Uint8ClampedArray.from(Buffer.concat(imageData)),
      1728
    );
  }

  /**
   * Loading means pulling the paper in a couple of inches. Handler will always
   * attempt to pull paper in. if none is pulled in, command still returns positive.
   */
  async loadPaper(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(
      LoadPaperCommand,
      undefined
    );
  }

  /**
   * Ejects out the front. Can eject from loaded or parked state. If there is
   * no paper to eject, handler will do nothing and return positive acknowledgement.
   */
  async ejectPaper(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(
      EjectPaperCommand,
      undefined
    );
  }

  /**
   * Parks paper inside the handler. If there is no paper to park, returns
   * negative acknowledgement.If paper already parked, does nothing and returns
   * positive acknowledgement. When parked, parkSensor should be true.
   */
  async parkPaper(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(
      ParkPaperCommand,
      undefined
    );
  }

  /**
   * Moves paper to the front for voter to see, but hangs on to the paper.
   * Equivalent to "reject hold." How do we differentiate the present paper
   * state from the state where paper has not been picked up yet?
   */
  presentPaper(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(
      PresentPaperAndHoldCommand,
      undefined
    );
  }

  /**
   * Ejects to ballot box. Can eject from loaded or parked state. If there is
   * no paper to eject, handler will do nothing and return positive acknowledgement.
   */
  async ejectBallot(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(
      EjectPaperToBallotCommand,
      undefined
    );
  }

  calibrate(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(
      ScannerCalibrationCommand,
      undefined
    );
  }

  /**
   * Moves paper to print position and moves print head to DOWN position. If
   * paper is already in an appropriate print position, does not move paper.
   * E.g. if paper is loaded, it will pull the paper in a few more inches, but
   * if the paper is parked, it will not move the paper. Printing can start in
   * a variety of positions.
   */
  enablePrint(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(
      EnablePrintCommand,
      undefined
    );
  }

  /**
   * Moves print head to UP position, does not move paper
   */
  disablePrint(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(
      DisablePrintCommand,
      undefined
    );
  }

  async setMotionUnits(x: Uint8, y: Uint8): Promise<USBOutTransferResult> {
    assertNumberIsInRangeInclusive(x, 0, 2040);
    assertNumberIsInRangeInclusive(y, 0, 4080);

    return this.transferOutGeneric(SetMotionUnitsCommand, { x, y });
  }

  async setLeftMargin(numMotionUnits: Uint16): Promise<USBOutTransferResult> {
    assertUint16(numMotionUnits);
    const [nH, nL] = Uint16toUint8(numMotionUnits);
    return this.transferOutGeneric(SetLeftMarginCommand, { nL, nH });
  }

  /**
   * Setting the printing area width to 0 results in setting it to the maximum,
   * which is usually what we want.
   */
  async setPrintingAreaWidth(
    numMotionUnits: Uint16 = 0
  ): Promise<USBOutTransferResult> {
    assertNumberIsInRangeInclusive(numMotionUnits, 0, DEVICE_MAX_WIDTH_DOTS);
    const [nH, nL] = Uint16toUint8(numMotionUnits);
    return this.transferOutGeneric(SetPrintingAreaWidthCommand, { nL, nH });
  }

  async setLineSpacing(numMotionUnits: Uint8): Promise<USBOutTransferResult> {
    return this.transferOutGeneric(SetLineSpacingCommand, { numMotionUnits });
  }

  async setPrintingSpeed(
    printingSpeed: PrintingSpeed
  ): Promise<USBOutTransferResult> {
    return this.transferOutGeneric(SetPrintingSpeedCommand, {
      speed: PRINTING_SPEED_CODES[printingSpeed],
    });
  }

  async setPrintingDensity(
    printingDensity: PrintingDensity
  ): Promise<USBOutTransferResult> {
    return this.transferOutGeneric(SetPrintingDensityCommand, {
      density: PRINTING_DENSITY_CODES[printingDensity],
    });
  }

  // TODO why do these functions accept as input a Uint16 instead of 2 Uint8s?
  async setAbsolutePrintPosition(
    numMotionUnits: Uint16
  ): Promise<USBOutTransferResult> {
    assertUint16(numMotionUnits);
    const [nH, nL] = Uint16toUint8(numMotionUnits);
    return this.transferOutGeneric(SetAbsolutePrintPositionCommand, { nL, nH });
  }

  async setRelativePrintPosition(
    numMotionUnits: number
  ): Promise<USBOutTransferResult> {
    assertNumberIsInRangeInclusive(numMotionUnits, INT_16_MIN, INT_16_MAX);
    const unsignedNumMotionUnits: Uint16 =
      numMotionUnits < 0 ? UINT_16_MAX + 1 - numMotionUnits : numMotionUnits;
    const [nH, nL] = Uint16toUint8(unsignedNumMotionUnits);
    return this.transferOutGeneric(SetRelativePrintPositionCommand, { nL, nH });
  }

  async setRelativeVerticalPrintPosition(
    numMotionUnits: number
  ): Promise<USBOutTransferResult> {
    assertNumberIsInRangeInclusive(numMotionUnits, INT_16_MIN, INT_16_MAX);
    const unsignedNumMotionUnits: Uint16 =
      numMotionUnits < 0 ? UINT_16_MAX + 1 + numMotionUnits : numMotionUnits;
    const [nH, nL] = Uint16toUint8(unsignedNumMotionUnits);
    return this.transferOutGeneric(SetRelativeVerticalPrintPositionCommand, {
      nL,
      nH,
    });
  }

  async bufferChunk(
    chunkedCustomBitmap: PaperHandlerBitmap
  ): Promise<USBOutTransferResult> {
    if (chunkedCustomBitmap.width >= 1024) {
      throw new Error('can only buffer chunks of width 1024 at a time');
    }

    const [nH, nL] = Uint16toUint8(chunkedCustomBitmap.width);

    const coder = message({
      command: literal(0x1b, 0x2a),
      bitImageMode: literal(PrintModeDotDensity.DOUBLE_DOT_24),
      nL: literal(nL),
      nH: literal(nH),
      imageData: byteArray(chunkedCustomBitmap.data.length),
    });

    debug(`Transferring out ${chunkedCustomBitmap.data.length} bits`);
    const result = this.transferOutGeneric(coder, {
      imageData: chunkedCustomBitmap.data,
    });
    debug('Done transferring');
    return result;
  }

  async printChunk(chunkedCustomBitmap: PaperHandlerBitmap): Promise<void> {
    const { width, data } = chunkedCustomBitmap;
    assert(
      width * 3 === data.length,
      `Expected data of length ${width * 3}, got ${data.length}`
    );
    assert(
      width <= DEVICE_MAX_WIDTH_DOTS,
      `Width must be <= ${DEVICE_MAX_WIDTH_DOTS}; got ${width}`
    ); // max width

    // In this case, we can send all data at once
    if (width < 1024) {
      debug('buffering single chunk');
      await this.bufferChunk(chunkedCustomBitmap);
      await this.print();
      return;
    }
    debug(`whole chunk width: ${chunkedCustomBitmap.width}`);

    // If chunk is 1024 dots wide or longer, have to buffer as two images
    const halfPageChunkWidth = DEVICE_MAX_WIDTH_DOTS / 2;
    const leftChunk: PaperHandlerBitmap = {
      width: halfPageChunkWidth,
      data: data.slice(0, halfPageChunkWidth * 3),
    };

    const rightChunk: PaperHandlerBitmap = {
      width: width - halfPageChunkWidth,
      data: data.slice(halfPageChunkWidth * 3),
    };

    debug(`buffering left chunk: ${leftChunk.width} width`);
    await this.bufferChunk(leftChunk);
    debug(`buffering right chunk: ${rightChunk.width} width`);
    await this.bufferChunk(rightChunk);
    debug('done buffering both chunks');

    debug('flushing line data to printer');
    await this.print();
    debug('printChunk end');
  }

  /**
   *
   * @param numMotionUnitsToFeedPaper Assuming you are operating in standard mode, the vertical motion unit will
   * be used.
   */
  async print(numMotionUnitsToFeedPaper: Uint8 = 0): Promise<void> {
    await this.transferOutGeneric(PrintAndFeedPaperCommand, {
      numMotionUnitsToFeedPaper,
    });
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
