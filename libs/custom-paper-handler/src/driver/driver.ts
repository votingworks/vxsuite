/* eslint-disable vx/gts-no-public-class-fields */
// public class fields allowed so the driver class can inherit from PaperHandlerDriverInterface,
// the interface shared by implementation and mock. Interfaces definitionally can't have private properties.
import { findByIds, WebUSBDevice } from 'usb';
import makeDebug from 'debug';
import { assert, Optional, Result, sleep } from '@votingworks/basics';
import { Buffer } from 'buffer';
import {
  byteArray,
  Coder,
  CoderError,
  literal,
  message,
} from '@votingworks/message-coder';
import { Mutex } from '@votingworks/utils';
import { createImageData, writeImageData } from '@votingworks/image-utils';
import {
  ImageColorDepthType,
  ImageFileFormat,
  ImageFromScanner,
  ImageResolution,
  ScanSide,
} from '@votingworks/custom-scanner';
import {
  assertNumberIsInRangeInclusive,
  assertUint16,
  BytesPerUint32,
  Uint16,
  Uint16toUint8,
  Uint8,
} from '../bits';
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
  getBitsPerPixelForScanType,
  INT_16_MAX,
  INT_16_MIN,
  OK_CONTINUE,
  OK_NO_MORE_DATA,
  PRINTING_DENSITY_CODES,
  PRINTING_SPEED_CODES,
  PrintingDensity,
  PrintingSpeed,
  PrintModeDotDensity,
  RealTimeRequestIds,
  SCAN_HEADER_LENGTH_BYTES,
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
  PaperHandlerBitmap,
  PaperHandlerStatus,
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
  TransferOutRealTimeRequest,
} from './coders';
import { PaperHandlerDriverInterface } from './driver_interface';
import { MinimalWebUsbDevice } from './minimal_web_usb_device';

const serverDebug = makeDebug('mark-scan:custom-paper-handler:driver');

function debug(msg: string, prefix?: string) {
  const fullMsg = prefix ? `[${prefix}] ${msg}` : msg;
  serverDebug(fullMsg);
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

export class PaperHandlerDriver implements PaperHandlerDriverInterface {
  statusInvocationCount = 0;

  // By convention, each driver public API method must hold the publicApiMutex lock before starting
  readonly publicApiMutex = new Mutex(undefined);
  // Locks the WebUsbDevice. API methods must acquire this lock before reading from or writing to
  // any of the 4 bulk endpoints (GENERIC_ENDPOINT_IN, etc)
  readonly webDeviceMutex: Mutex<MinimalWebUsbDevice>;

  readonly scannerConfig: ScannerConfig = getDefaultConfig();

  constructor(webDevice: MinimalWebUsbDevice) {
    this.webDeviceMutex = new Mutex(webDevice);
  }

  async connect(): Promise<void> {
    return await this.publicApiMutex.withLockAndLockerId('connect', () =>
      this.webDeviceMutex.withLock(async (webDevice) => {
        await webDevice.open();
        debug('opened web device');
        await webDevice.selectConfiguration(CONFIGURATION_NUMBER);
        debug(`selected configuration ${CONFIGURATION_NUMBER}`);
        await webDevice.claimInterface(INTERFACE_NUMBER);
        debug(`claimed usb interface ${INTERFACE_NUMBER}`);
      })
    );
  }

  async disconnect(): Promise<void> {
    // closing the web device will fail if we have pending requests, so wait for them
    await this.publicApiMutex.withLockAndLockerId('disconnect', () =>
      this.webDeviceMutex.withLock((webDevice) => webDevice.close())
    );
  }

  /**
   * Send commands or data on the generic bulk out endpoint.
   * Expects the caller to acquire the lock for and pass in the WebUsbDevice.
   */
  transferOutGeneric<T>(
    webDevice: MinimalWebUsbDevice,
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
    return webDevice.transferOut(GENERIC_ENDPOINT_OUT, data);
  }

  /**
   * Receive data or command responses on the generic bulk in endpoint.
   * Expects the caller to acquire the lock for and pass in the WebUsbDevice.
   */
  transferInGeneric(
    webDevice: MinimalWebUsbDevice
  ): Promise<USBInTransferResult> {
    return webDevice.transferIn(GENERIC_ENDPOINT_IN, PACKET_SIZE);
  }

  async clearGenericInBuffer(): Promise<void> {
    await this.webDeviceMutex.withLock(async (webDevice) => {
      let bufferClear = false;
      let i = -1;

      while (!bufferClear) {
        bufferClear = await Promise.race([
          sleep(1000).then(() => {
            return true;
          }),
          this.transferInGeneric(webDevice).then(() => {
            return false;
          }),
        ]);
        i += 1;
      }
      debug(`${i} packets cleared`);
    });
  }

  /**
   * Transfers data out on the real time bulk out endpoint. Callers are
   * expected to acquire the lock for the WebUsbDevice and pass it in.
   */
  transferOutRealTime(
    webDevice: MinimalWebUsbDevice,
    requestId: Uint8
  ): Promise<USBOutTransferResult> {
    const buf = TransferOutRealTimeRequest.encode({
      requestId,
    }).unsafeUnwrap();

    return webDevice.transferOut(REAL_TIME_ENDPOINT_OUT, buf);
  }

  /**
   * Receives data from the real time bulk in endpoint. Callers are
   * expected to acquire the lock for the WebUsbDevice and pass it in.
   */
  transferInRealTime(
    webDevice: MinimalWebUsbDevice
  ): Promise<USBInTransferResult> {
    return webDevice.transferIn(REAL_TIME_ENDPOINT_IN, PACKET_SIZE);
  }

  async handleRealTimeExchange<T>(
    requestId: RealTimeRequestIds,
    coder: Coder<T>
    // According to the manual, "REAL-TIME USB PROTOCOL FORMAT" supports transferring out optional data.
    // The prototype doesn't support it, so leave out support from this function until needed.
  ): Promise<Result<T, CoderError>> {
    return await this.webDeviceMutex.withLock(async (webDevice) => {
      const transferOutResult = await this.transferOutRealTime(
        webDevice,
        requestId
      );
      assert(transferOutResult.status === 'ok'); // TODO: handling

      const transferInResult = await this.transferInRealTime(webDevice);
      assert(transferInResult.status === 'ok'); // TODO: handling

      const { data } = transferInResult;
      assert(data);
      return coder.decode(Buffer.from(data.buffer));
    });
  }

  /**
   * According to manual, "Clears the data in the print buffer and resets the
   * device mode to that in effect when power was turned on." It is called
   * initialize device but it appears to actually just initialize the printer.
   */
  async initializePrinter(): Promise<void> {
    await this.publicApiMutex.withLockAndLockerId('initializePrinter', () =>
      this.webDeviceMutex.withLock((webDevice) =>
        this.transferOutGeneric(webDevice, InitializeRequestCommand, undefined)
      )
    );
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
    return await this.publicApiMutex.withLockAndLockerId(
      'abortScan',
      async () => {
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
    );
  }

  // reset scan reconnects the scanner, changes the device address, and requires a new WebUSBDevice
  async resetScan(): Promise<void> {
    return await this.publicApiMutex.withLockAndLockerId(
      'resetScan',
      async () => {
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
    );
  }

  /**
   * Does not map to a single command, but is useful for testing
   * @returns {PaperHandlerStatus}
   */
  async getPaperHandlerStatus(): Promise<PaperHandlerStatus> {
    this.statusInvocationCount += 1;
    return await this.publicApiMutex.withLockAndLockerId(
      `getPaperHandlerStatus-${this.statusInvocationCount}`,
      async () => {
        const printerStatus = await this.getPrinterStatus();
        const scannerStatus = await this.getScannerStatus();
        return {
          ...scannerStatus,
          ...printerStatus,
        };
      }
    );
  }

  /**
   * Sends command to generic endpoint and receives acknowledgement. Returns
   * true for positive acknowledgement and false for negative acknowledgement.
   */
  async handleGenericCommandWithAcknowledgement<T>(
    coder: Coder<T>,
    value: T
  ): Promise<boolean> {
    return await this.webDeviceMutex.withLock(async (webDevice) => {
      const transferOutResult = await this.transferOutGeneric(
        webDevice,
        coder,
        value
      );
      assert(transferOutResult.status === 'ok'); // TODO: Handling

      const transferInResult = await this.transferInGeneric(webDevice);
      assert(transferInResult.status === 'ok'); // TODO: Handling

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
    });
  }

  async getScannerCapability(): Promise<ScannerCapability> {
    return await this.publicApiMutex.withLockAndLockerId(
      'getScannerCapability',
      () =>
        this.webDeviceMutex.withLock(async (webDevice) => {
          await this.transferOutGeneric(
            webDevice,
            GetScannerCapabilityCommand,
            undefined
          );
          const transferInResult = await this.transferInGeneric(webDevice);
          const { data } = transferInResult;
          assert(data);
          return parseScannerCapability(data);
        })
    );
  }

  async syncScannerConfig(): Promise<boolean> {
    return this.handleGenericCommandWithAcknowledgement(
      ConfigureScannerCommand,
      getScannerConfigCoderValues(this.scannerConfig)
    );
  }

  async setScanLight(scanLight: ScanLight): Promise<boolean> {
    return await this.publicApiMutex.withLockAndLockerId('setScanLight', () => {
      this.scannerConfig.scanLight = scanLight;
      return this.syncScannerConfig();
    });
  }

  async setScanDataFormat(scanDataFormat: ScanDataFormat): Promise<boolean> {
    return await this.publicApiMutex.withLockAndLockerId(
      'setScanDateFormat',
      () => {
        this.scannerConfig.scanDataFormat = scanDataFormat;
        return this.syncScannerConfig();
      }
    );
  }

  async setScanResolution({
    horizontalResolution,
    verticalResolution,
  }: {
    horizontalResolution: Resolution;
    verticalResolution: Resolution;
  }): Promise<boolean> {
    return await this.publicApiMutex.withLockAndLockerId(
      'setScanResolution',
      () => {
        this.scannerConfig.horizontalResolution = horizontalResolution;
        this.scannerConfig.verticalResolution = verticalResolution;
        return this.syncScannerConfig();
      }
    );
  }

  async setPaperMovementAfterScan(
    paperMovementAfterScan: PaperMovementAfterScan
  ): Promise<boolean> {
    return await this.publicApiMutex.withLockAndLockerId(
      'setPaperMovementAfterScan',
      () => {
        this.scannerConfig.paperMovementAfterScan = paperMovementAfterScan;
        return this.syncScannerConfig();
      }
    );
  }

  async setScanDirection(scanDirection: ScanDirection): Promise<boolean> {
    return await this.publicApiMutex.withLockAndLockerId(
      'setScanDirection',
      () => {
        this.scannerConfig.scanDirection = scanDirection;
        return this.syncScannerConfig();
      }
    );
  }

  async scan(): Promise<ImageData> {
    let scanStatus = OK_CONTINUE;
    let width = -1;
    const imageData: Uint8Array[] = [];

    await this.webDeviceMutex.withLock(async (webDevice) => {
      await this.transferOutGeneric(webDevice, ScanCommand, undefined);
      debug('STARTING SCAN');
      let dataBlockBytesReceived = 0;

      // Assumptions:
      // 1. There's at least 1 data block
      // 2. Each data block can fit within a single `transferInGeneric` call
      while (scanStatus === OK_CONTINUE) {
        const rawResponse = await this.transferInGeneric(webDevice);
        assert(rawResponse?.data);

        const responseBuffer = new Uint8Array(
          rawResponse.data.buffer,
          rawResponse.data.byteOffset,
          rawResponse.data.byteLength
        );
        const header = responseBuffer.slice(0, SCAN_HEADER_LENGTH_BYTES);
        const response: ScanResponse = ScanResponse.decode(
          Buffer.from(header)
        ).unsafeUnwrap();
        scanStatus = response.returnCode;
        const { sizeX, sizeY } = response;
        // `sizeX` is the width of the current data block. The scan command always returns an empty data block as the last packet,
        // so the last `sizeX` value received is 0 - not useful. Instead, we store the first `sizeX` value we receive.
        // Note this assumes `sizeX` is the same for all packets 0...(n-1)
        if (width === -1) {
          width = sizeX;
        }
        const pixelsPerByte = 8 / getBitsPerPixelForScanType(response.scan);
        debug(`sizeX: ${sizeX}, sizeY: ${sizeY}, ppb: ${pixelsPerByte}`);
        const dataBlockByteLength = (sizeX * sizeY) / pixelsPerByte;
        const dataBlock = responseBuffer.slice(SCAN_HEADER_LENGTH_BYTES);
        dataBlockBytesReceived += dataBlock.byteLength;
        debug(
          `Expected ${dataBlockByteLength} bytes, got ${dataBlock.byteLength} in this block, ${dataBlockBytesReceived} so far`
        );
        imageData.push(new Uint8Array(dataBlock));
      }
    });

    debug('ALL BLOCKS RECEIVED');
    if (scanStatus !== OK_NO_MORE_DATA) {
      throw new Error(
        `Unhandled scan result status: ${scanStatus
          .toString(16)
          .padStart(2, '0')
          .toUpperCase()}`
      );
    }
    const imageBuf = Buffer.concat(imageData);
    return createImageData(
      Uint8ClampedArray.from(imageBuf),
      width,
      imageBuf.byteLength / width
    );
  }

  async scanAndSave(pathOut: string): Promise<ImageFromScanner> {
    return await this.publicApiMutex.withLockAndLockerId(
      'scanAndSave',
      async () => {
        await this.setScanDirection('backward');
        const grayscaleResult = await this.scan();
        debug(
          `Received imageData with specs:\nHeight=${grayscaleResult.height}, Width=${grayscaleResult.width}, data byte length=${grayscaleResult.data.byteLength}`
        );
        const grayscaleData = grayscaleResult.data;
        const colorResult = createImageData(
          grayscaleResult.width,
          grayscaleResult.height
        );
        const colorData = new Uint32Array(
          colorResult.data.buffer,
          colorResult.data.byteOffset,
          // `length` is the length in elements of the Uint32Array, not number of bytes
          // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/length
          colorResult.data.byteLength / BytesPerUint32
        );
        for (let i = 0; i < grayscaleData.byteLength; i += 1) {
          const luminance = grayscaleData[i];
          assert(luminance !== undefined);
          colorData[i] =
            (luminance << 24) | (luminance << 16) | (luminance << 8) | 255;
        }
        await writeImageData(pathOut, colorResult);

        const imageMetadata: ImageFromScanner = {
          imageBuffer: Buffer.from(colorResult.data),
          imageWidth: grayscaleResult.width,
          imageHeight: grayscaleResult.height,
          imageDepth: ImageColorDepthType.Color24bpp, // Hardcode for now?
          imageFormat: ImageFileFormat.Jpeg,
          scanSide: ScanSide.A,
          imageResolution: ImageResolution.RESOLUTION_200_DPI, // Confirm this
        };
        return imageMetadata;
      }
    );
  }

  /**
   * Loading means pulling the paper in a couple of inches. Handler will always
   * attempt to pull paper in. if none is pulled in, command still returns positive.
   */
  async loadPaper(): Promise<boolean> {
    return await this.publicApiMutex.withLockAndLockerId(
      'loadPaper',
      async () =>
        await this.handleGenericCommandWithAcknowledgement(
          LoadPaperCommand,
          undefined
        )
    );
  }

  /**
   * Ejects out the front. Can eject from loaded or parked state. If there is
   * no paper to eject, handler will do nothing and return positive acknowledgement.
   */
  async ejectPaperToFront(): Promise<boolean> {
    return await this.publicApiMutex.withLockAndLockerId(
      'ejecttPaperToFront',
      async () =>
        await this.handleGenericCommandWithAcknowledgement(
          EjectPaperCommand,
          undefined
        )
    );
  }

  /**
   * Parks paper inside the handler. If there is no paper to park, returns
   * negative acknowledgement.If paper already parked, does nothing and returns
   * positive acknowledgement. When parked, parkSensor should be true.
   */
  async parkPaper(): Promise<boolean> {
    return await this.publicApiMutex.withLockAndLockerId(
      'parkPaper',
      async () =>
        await this.handleGenericCommandWithAcknowledgement(
          ParkPaperCommand,
          undefined
        )
    );
  }

  /**
   * Moves paper to the front for voter to see, but hangs on to the paper.
   * Equivalent to "reject hold." How do we differentiate the present paper
   * state from the state where paper has not been picked up yet?
   */
  presentPaper(): Promise<boolean> {
    return this.publicApiMutex.withLockAndLockerId(
      'presentPaper',
      async () =>
        await this.handleGenericCommandWithAcknowledgement(
          PresentPaperAndHoldCommand,
          undefined
        )
    );
  }

  /**
   * Ejects to ballot box. Can eject from loaded or parked state. If there is
   * no paper to eject, handler will do nothing and return positive acknowledgement.
   */
  async ejectBallotToRear(): Promise<boolean> {
    return await this.publicApiMutex.withLockAndLockerId(
      'ejectBallotToRear',
      async () =>
        await this.handleGenericCommandWithAcknowledgement(
          EjectPaperToBallotCommand,
          undefined
        )
    );
  }

  calibrate(): Promise<boolean> {
    return this.publicApiMutex.withLockAndLockerId(
      'calibrate',
      async () =>
        await this.handleGenericCommandWithAcknowledgement(
          ScannerCalibrationCommand,
          undefined
        )
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
    return this.publicApiMutex.withLockAndLockerId(
      'enablePrint',
      async () =>
        await this.handleGenericCommandWithAcknowledgement(
          EnablePrintCommand,
          undefined
        )
    );
  }

  /**
   * Moves print head to UP position, does not move paper
   */
  disablePrint(): Promise<boolean> {
    return this.publicApiMutex.withLockAndLockerId(
      'disablePrint',
      async () =>
        await this.handleGenericCommandWithAcknowledgement(
          DisablePrintCommand,
          undefined
        )
    );
  }

  async setMotionUnits(x: Uint8, y: Uint8): Promise<USBOutTransferResult> {
    return await this.publicApiMutex.withLockAndLockerId('setMotionUnits', () =>
      this.webDeviceMutex.withLock((webDevice) => {
        assertNumberIsInRangeInclusive(x, 0, 2040);
        assertNumberIsInRangeInclusive(y, 0, 4080);

        return this.transferOutGeneric(webDevice, SetMotionUnitsCommand, {
          x,
          y,
        });
      })
    );
  }

  async setLeftMargin(numMotionUnits: Uint16): Promise<USBOutTransferResult> {
    return await this.publicApiMutex.withLockAndLockerId('setLeftMargin', () =>
      this.webDeviceMutex.withLock((webDevice) => {
        assertUint16(numMotionUnits);
        const [nH, nL] = Uint16toUint8(numMotionUnits);
        return this.transferOutGeneric(webDevice, SetLeftMarginCommand, {
          nL,
          nH,
        });
      })
    );
  }

  /**
   * Setting the printing area width to 0 results in setting it to the maximum,
   * which is usually what we want.
   */
  async setPrintingAreaWidth(
    numMotionUnits: Uint16 = 0
  ): Promise<USBOutTransferResult> {
    return await this.publicApiMutex.withLockAndLockerId(
      'setPrintingAreaWidth',
      () =>
        this.webDeviceMutex.withLock((webDevice) => {
          assertNumberIsInRangeInclusive(
            numMotionUnits,
            0,
            DEVICE_MAX_WIDTH_DOTS
          );
          const [nH, nL] = Uint16toUint8(numMotionUnits);
          return this.transferOutGeneric(
            webDevice,
            SetPrintingAreaWidthCommand,
            {
              nL,
              nH,
            }
          );
        })
    );
  }

  async setLineSpacing(numMotionUnits: Uint8): Promise<USBOutTransferResult> {
    return await this.publicApiMutex.withLockAndLockerId('setLineSpacing', () =>
      this.webDeviceMutex.withLock((webDevice) =>
        this.transferOutGeneric(webDevice, SetLineSpacingCommand, {
          numMotionUnits,
        })
      )
    );
  }

  async setPrintingSpeed(
    printingSpeed: PrintingSpeed
  ): Promise<USBOutTransferResult> {
    return await this.publicApiMutex.withLockAndLockerId(
      'setPrintingSpeed',
      () =>
        this.webDeviceMutex.withLock((webDevice) =>
          this.transferOutGeneric(webDevice, SetPrintingSpeedCommand, {
            speed: PRINTING_SPEED_CODES[printingSpeed],
          })
        )
    );
  }

  async setPrintingDensity(
    printingDensity: PrintingDensity
  ): Promise<USBOutTransferResult> {
    return await this.publicApiMutex.withLockAndLockerId(
      'setPrintingDensity',
      () =>
        this.webDeviceMutex.withLock((webDevice) =>
          this.transferOutGeneric(webDevice, SetPrintingDensityCommand, {
            density: PRINTING_DENSITY_CODES[printingDensity],
          })
        )
    );
  }

  async setAbsolutePrintPosition(
    numMotionUnits: Uint16
  ): Promise<USBOutTransferResult> {
    return await this.publicApiMutex.withLockAndLockerId(
      'setAbsolutePrintPosition',
      () =>
        this.webDeviceMutex.withLock((webDevice) => {
          assertUint16(numMotionUnits);
          const [nH, nL] = Uint16toUint8(numMotionUnits);
          return this.transferOutGeneric(
            webDevice,
            SetAbsolutePrintPositionCommand,
            { nL, nH }
          );
        })
    );
  }

  async setRelativePrintPosition(
    numMotionUnits: number
  ): Promise<USBOutTransferResult> {
    return await this.publicApiMutex.withLockAndLockerId(
      'setRelativePrintPosition',
      () =>
        this.webDeviceMutex.withLock((webDevice) => {
          assertNumberIsInRangeInclusive(
            numMotionUnits,
            INT_16_MIN,
            INT_16_MAX
          );
          const unsignedNumMotionUnits: Uint16 =
            numMotionUnits < 0
              ? UINT_16_MAX + 1 - numMotionUnits
              : numMotionUnits;
          const [nH, nL] = Uint16toUint8(unsignedNumMotionUnits);
          return this.transferOutGeneric(
            webDevice,
            SetRelativePrintPositionCommand,
            { nL, nH }
          );
        })
    );
  }

  async setRelativeVerticalPrintPosition(
    numMotionUnits: number
  ): Promise<USBOutTransferResult> {
    return await this.publicApiMutex.withLockAndLockerId(
      'setRealtiveVerticalPrintPosition',
      () =>
        this.webDeviceMutex.withLock((webDevice) => {
          assertNumberIsInRangeInclusive(
            numMotionUnits,
            INT_16_MIN,
            INT_16_MAX
          );
          const unsignedNumMotionUnits: Uint16 =
            numMotionUnits < 0
              ? UINT_16_MAX + 1 + numMotionUnits
              : numMotionUnits;
          const [nH, nL] = Uint16toUint8(unsignedNumMotionUnits);
          return this.transferOutGeneric(
            webDevice,
            SetRelativeVerticalPrintPositionCommand,
            { nL, nH }
          );
        })
    );
  }

  // Expects caller to acquire lock for and pass in a WebUsbDevice
  async bufferChunk(
    webDevice: MinimalWebUsbDevice,
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

    const result = this.transferOutGeneric(webDevice, coder, {
      imageData: chunkedCustomBitmap.data,
    });
    debug('Done transferring');
    return result;
  }

  async printChunk(chunkedCustomBitmap: PaperHandlerBitmap): Promise<void> {
    // Implementation is slightly scuffed. We probably want the caller to hold the WebUsbDevice lock
    // so we aren't locking and unlocking every chunk.
    return await this.publicApiMutex.withLockAndLockerId('printChunk', () =>
      this.webDeviceMutex.withLock(async (webDevice) => {
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
          await this.bufferChunk(webDevice, chunkedCustomBitmap);
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
        await this.bufferChunk(webDevice, leftChunk);
        debug(`buffering right chunk: ${rightChunk.width} width`);
        await this.bufferChunk(webDevice, rightChunk);
        debug('done buffering both chunks');

        debug('flushing line data to printer');
        await this.print();
        debug('printChunk end');
      })
    );
  }

  /**
   *
   * @param numMotionUnitsToFeedPaper Assuming you are operating in standard mode, the vertical motion unit will
   * be used.
   */
  async print(numMotionUnitsToFeedPaper: Uint8 = 0): Promise<void> {
    await this.publicApiMutex.withLockAndLockerId('print', () =>
      this.webDeviceMutex.withLock(
        async (webDevice) =>
          await this.transferOutGeneric(webDevice, PrintAndFeedPaperCommand, {
            numMotionUnitsToFeedPaper,
          })
      )
    );
  }
}
