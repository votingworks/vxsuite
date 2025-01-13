import { findByIds, WebUSBDevice } from 'usb';
import { assert, Optional } from '@votingworks/basics';
import { byteArray, Coder, literal, message } from '@votingworks/message-coder';
import { Buffer } from 'node:buffer';
import { Lock } from './lock';
import { MinimalWebUsbDevice } from './minimal_web_usb_device';
import {
  BitImagePrintMode,
  PrinterResetCommand,
  RawPrinterStatus,
  PrinterStatusResponse,
  SetReplyParameterCommand,
  FeedForwardCommand,
  PrintQuality,
  SetPrintQuality,
  convertPrintQualityToCoderValue,
} from './coders';
import { Uint16toUint8, Uint8 } from '../bits';
import { CompressedBitImage } from './types';
import { isInconsistentStatus } from './status';
import { rootDebug } from '../debug';

const debug = rootDebug.extend('driver');

// USB Interface Information
const VENDOR_ID = 0x0430;
const PRODUCT_ID = 0x0626;
const CONFIGURATION_NUMBER = 1;
const INTERFACE_NUMBER = 0;
const ENDPOINT_OUT = 1;

export async function getDevice(): Promise<Optional<WebUSBDevice>> {
  debug('checking for thermal printer...');
  const legacyDevice = findByIds(VENDOR_ID, PRODUCT_ID);
  if (!legacyDevice) {
    debug('no thermal printer found');
    return;
  }
  debug('thermal printer found');

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

export interface FujitsuThermalPrinterDriverInterface {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  resetPrinter(): Promise<void>;
  setPrintQuality(printQuality: PrintQuality): Promise<void>;
  getStatus(): Promise<RawPrinterStatus>;
  setReplyParameter(parameter: Uint8): Promise<void>;
  printBitImage(bitImage: CompressedBitImage): void;
  feedForward(dots: number): Promise<void>;
}

export class FujitsuThermalPrinterDriver
  implements FujitsuThermalPrinterDriverInterface
{
  private readonly lock = new Lock();
  private readonly webDevice: MinimalWebUsbDevice;

  constructor(_webDevice: MinimalWebUsbDevice) {
    this.webDevice = _webDevice;
  }

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
    await this.lock.acquire();
    this.lock.release();

    await this.webDevice.releaseInterface(INTERFACE_NUMBER);
    debug('released usb interface');
    await this.webDevice.close();
    debug('closed web usb device');
  }

  /**
   * Send commands on the bulk endpoint.
   */
  private async transferOut<T>(
    coder: Coder<T>,
    value: T
  ): // @ts-ignore
  Promise<USBOutTransferResult> {
    const encodeResult = coder.encode(value);
    const data = encodeResult.unsafeUnwrap();

    await this.lock.acquire();
    const result = await this.webDevice.transferOut(ENDPOINT_OUT, data);
    this.lock.release();

    debug(JSON.stringify(result));
    return result;
  }

  async resetPrinter(): Promise<void> {
    debug(`resetting printer to default settings...`);
    await this.transferOut(PrinterResetCommand, {});
  }

  /**
   * Gets the status as reported by the printer itself.
   */
  async getStatus(retryOnInconsistentStatus = true): Promise<RawPrinterStatus> {
    // Status is fetched through a "control transfer" which follows a more
    // specific USB protocol than bulk transfers.
    debug('fetching status from printer...');
    await this.lock.acquire();
    const result = await this.webDevice.controlTransferIn(
      {
        requestType: 'vendor',
        recipient: 'interface',
        request: 0x01,
        value: 0x0000,
        index: 0x0000,
      },
      4
    );
    this.lock.release();

    const { data } = result;
    assert(data);
    const status = PrinterStatusResponse.decode(
      Buffer.from(data.buffer)
    ).unsafeUnwrap();

    // Whenever the device exits an offline state, it somehow buffers the
    // specific offline reason but not the actual isOffline flag. We pick up the
    // buffered flag on the next status transfer. For example, when you close
    // the cover, the next status will say that the printer is back online but the
    // cover is still open. There is a setting to turn off these buffered statuses,
    // but it only takes effect via RS-232C, not USB. We retry on each inconsistent
    // status to catch the state change without the consumer having to poll again.
    // The driver does not buffer incorrect flags multiple times, so we only need
    // to retry once.
    if (isInconsistentStatus(status)) {
      debug(`inconsistent status received`);
      if (retryOnInconsistentStatus) {
        debug(`retrying once...`);
        return this.getStatus(false);
      }
    }

    debug(`status: ${JSON.stringify(status)}`);
    return status;
  }

  async setReplyParameter(parameter: Uint8): Promise<void> {
    debug(`setting reply parameter to ${parameter}...`);
    await this.transferOut(SetReplyParameterCommand, { parameter });
  }

  async printBitImage(bitImage: CompressedBitImage): Promise<void> {
    assert(bitImage.height > 0 && bitImage.height < 1024);
    const [n1, n2] = Uint16toUint8(bitImage.height);

    const coder = message({
      command: literal(0x1b, 0x2a),
      mode: literal(BitImagePrintMode.DOUBLE_DENSITY_COMPRESSED),
      n2: literal(n2),
      n1: literal(n1),
      imageData: byteArray(bitImage.data.length),
    });

    debug(`printing bit image...`);
    await this.transferOut(coder, {
      n2,
      n1,
      imageData: new Uint8Array(bitImage.data),
    });
  }

  async feedForward(dots: number): Promise<void> {
    debug(`feeding ${dots} dot lines...`);
    await this.transferOut(FeedForwardCommand, { dots });
  }

  async setPrintQuality(printQuality: PrintQuality): Promise<void> {
    debug(
      `setting print quality to "${
        printQuality.paperQuality
      }" and turning auto-division ${
        printQuality.automaticDivision ? 'on' : 'off'
      }...`
    );
    await this.transferOut(
      SetPrintQuality,
      convertPrintQualityToCoderValue(printQuality)
    );
  }
}
