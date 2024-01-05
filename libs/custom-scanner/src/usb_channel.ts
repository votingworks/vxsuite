import { assert, err, ok, Result } from '@votingworks/basics';
import { Buffer } from 'buffer';
import makeDebug from 'debug';
import { inspect } from 'util';
import { DuplexChannel, ErrorCode } from './types';

const debug = makeDebug('custom:usb-channel');

const READ_RETRY_MAX = 5;
const WRITE_RETRY_MAX = 3;

/* c8 ignore start */
function truncateStringForDisplay(string: string, maxLength = 100): string {
  return string.length > maxLength
    ? `${string.slice(0, maxLength - 1)}…`
    : string;
}
/* c8 ignore stop */

/**
 * Options for building a `UsbChannel`.
 */
export interface UsbChannelOptions {
  /**
   * The `configurationValue` of the USB configuration to use.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/USBConfiguration/configurationValue
   */
  readonly configurationValue: number;

  /**
   * The `interfaceNumber` of the USB interface to use.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/USBInterface
   */
  readonly interfaceNumber: number;

  /**
   * The `endpointNumber` of the USB endpoint to use for reading.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/USBEndpoint
   */
  readonly readEndpointNumber: number;

  /**
   * The `endpointNumber` of the USB endpoint to use for writing.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/USBEndpoint
   */
  readonly writeEndpointNumber: number;
}

/**
 * Provides a higher level of abstraction for communicating with a USB device.
 * You must call `connect` before reading and writing, and call `disconnect`
 * when you're done.
 */
export class UsbChannel implements DuplexChannel {
  private connected = false;

  /**
   * @param device the underlying USB device (https://developer.mozilla.org/en-US/docs/Web/API/USBDevice)
   * @param options which USB configuration, interface, and endpoints to use
   */
  constructor(
    private readonly device: USBDevice,
    private readonly options: UsbChannelOptions
  ) {}

  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Connects to the device and prepares to send commands. You must call
   * `disconnect` when you're done with it.
   */
  async connect(): Promise<Result<void, ErrorCode>> {
    try {
      if (!this.connected) {
        debug(
          'not connected, attempting to open and claim interface (configuration=%s, interface=%s)',
          this.options.configurationValue,
          this.options.interfaceNumber
        );
        await this.device.open();
        await this.device.selectConfiguration(this.options.configurationValue);
        await this.device.claimInterface(this.options.interfaceNumber);

        const validateEndpointsResult = this.validateReadWriteEndpoints();

        if (validateEndpointsResult.isErr()) {
          debug(
            'failed to connect over interface %s: %o',
            this.options.interfaceNumber,
            validateEndpointsResult.err()
          );
          return validateEndpointsResult;
        }

        this.connected = true;
      }

      return ok();
    } catch (error) {
      debug('unhandled read error: %o', error);
      return err(ErrorCode.CommunicationUnknownError);
    }
  }

  /**
   * Disconnects from the device.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    debug('releasing interface and closing device');
    await this.device.releaseInterface(this.options.interfaceNumber);
    await this.device.close();

    this.connected = false;
    debug('disconnected');
  }

  /**
   * Low-level method to read data from the device.
   */
  async read(maxLength: number): Promise<Result<Buffer, ErrorCode>> {
    const { connected, options } = this;

    if (!connected) {
      return err(ErrorCode.ScannerOffline);
    }

    const { readEndpointNumber } = options;

    let inResult!: USBInTransferResult;

    for (let i = 0; i < READ_RETRY_MAX; i += 1) {
      debug('receiving response (attempt %s)', i + 1);
      inResult = await this.device.transferIn(readEndpointNumber, maxLength);

      if (inResult.status !== 'ok') {
        debug(
          'receive failed (status=%s), attempting to clear halt before retry',
          inResult.status
        );
        await this.device.clearHalt('in', readEndpointNumber);
        continue;
      } else if (!inResult.data || inResult.data.byteLength === 0) {
        debug('received no data, aborting');
        break;
      }

      const data = Buffer.from(inResult.data.buffer);
      debug(
        'received response: %o (%s)',
        data,
        inspect(truncateStringForDisplay(data.toString('utf8')))
      );
      return ok(data);
    }

    debug('retries exhausted, aborting');
    return err(ErrorCode.NoDeviceAnswer);
  }

  /**
   * Low-level method to send data to the device.
   */
  async write(data: Buffer): Promise<Result<void, ErrorCode>> {
    const { connected, options } = this;

    if (!connected) {
      return err(ErrorCode.ScannerOffline);
    }

    const { writeEndpointNumber } = options;
    let outResult!: USBOutTransferResult;
    let writeOffset = 0;

    for (let i = 0; i < WRITE_RETRY_MAX; i += 1) {
      debug('sending request (attempt %d/%d)', i + 1, WRITE_RETRY_MAX);
      outResult = await this.device.transferOut(
        writeEndpointNumber,
        data.subarray(writeOffset)
      );

      if (outResult.status !== 'ok') {
        debug('send failed (status=%s)', outResult.status);
        await this.device.clearHalt('out', writeEndpointNumber);
        continue;
      }

      if (writeOffset + outResult.bytesWritten !== data.length) {
        debug(
          'send failed (bytesWritten=%d, expected=%d)',
          writeOffset + outResult.bytesWritten,
          data.length
        );
        writeOffset += outResult.bytesWritten;
        continue;
      }

      debug(
        'sent request: %o (%s)',
        data,
        inspect(truncateStringForDisplay(data.toString('utf8')))
      );
      return ok();
    }

    return err(ErrorCode.WriteError);
  }

  /**
   * Validates the read and write endpoints for communicating with the device.
   * Requires that the connection has been established and the interface
   * claimed.
   */
  private validateReadWriteEndpoints(): Result<void, ErrorCode> {
    const { configuration } = this.device;
    assert(
      configuration,
      'configuration should be set because of the `selectConfiguration` call in `connect`'
    );

    const usbInterface = configuration.interfaces.find(
      ({ interfaceNumber }) => interfaceNumber === this.options.interfaceNumber
    );

    assert(
      usbInterface,
      'interface should be set because of the `claimInterface` call in `connect`'
    );

    const readEndpoint = usbInterface.alternate.endpoints.find(
      ({ endpointNumber, direction }) =>
        endpointNumber === this.options.readEndpointNumber && direction === 'in'
    );
    const writeEndpoint = usbInterface.alternate.endpoints.find(
      ({ endpointNumber, direction }) =>
        endpointNumber === this.options.writeEndpointNumber &&
        direction === 'out'
    );

    if (
      typeof readEndpoint === 'undefined' ||
      typeof writeEndpoint === 'undefined'
    ) {
      debug('unable to find read/write endpoints');
      return err(ErrorCode.OpenDeviceError);
    }

    debug('got endpoints: read=%s, write=%s', readEndpoint, writeEndpoint);
    return ok();
  }
}
