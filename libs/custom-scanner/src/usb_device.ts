import { err, ok, Result } from '@votingworks/basics';
import { Buffer } from 'buffer';
import makeDebug from 'debug';
import { WebUSBDevice } from 'usb';
import { inspect } from 'util';
import { Lock } from './lock';
import { Device, ErrorCode } from './types';

const debug = makeDebug('custom:device');

const READ_ENDPOINT_INDEX = 3;
const WRITE_ENDPOINT_INDEX = 4;
const INTERFACE_INDEX = 0;
const READ_RETRY_MAX = 5;
const WRITE_RETRY_MAX = 3;

function truncateStringForDisplay(string: string, maxLength = 100): string {
  return string.length > maxLength
    ? `${string.slice(0, maxLength - 1)}…`
    : string;
}

/**
 * Builds a `Device` from a WebUSB device. You must call `connect` before
 * sending commands and `disconnect` when you're done.
 */
export class UsbDevice implements Device {
  private connected = false;
  private readonly lock = new Lock();

  constructor(private readonly device: WebUSBDevice) {}

  /**
   * Connects to the device and prepares to send commands. You must call
   * `disconnect` when you're done with it.
   */
  async connect(): Promise<Result<void, ErrorCode>> {
    try {
      if (!this.connected) {
        debug('not connected, attempting to open and claim interface');
        await this.device.open();
        await this.device.claimInterface(INTERFACE_INDEX);

        const getEndpointResult = this.getReadWriteEndpoints();

        if (getEndpointResult.isErr()) {
          debug(
            'failed to connect over interface %s: %o',
            INTERFACE_INDEX,
            getEndpointResult.err()
          );
          return getEndpointResult;
        }

        // const [readEndpointNumber, writeEndpointNumber] =
        //   getEndpointResult.ok();
        // debug(
        //   'clearing halt on endpoints %s and %s',
        //   readEndpointNumber,
        //   writeEndpointNumber
        // );
        // debug(
        //   'clear read halt: %o',
        //   await new Promise((resolve) => {
        //     // eslint-disable-next-line no-underscore-dangle
        //     this.device['device'].__clearHalt(readEndpointNumber, resolve);
        //   })
        // );
        // debug(
        //   'clear write halt: %o',
        //   await new Promise((resolve) => {
        //     // eslint-disable-next-line no-underscore-dangle
        //     this.device['device'].__clearHalt(writeEndpointNumber, resolve);
        //   })
        // );
        // await this.device.clearHalt('in', readEndpointNumber);
        // await this.device.clearHalt('out', writeEndpointNumber);

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
    if (!this.connected) {
      return;
    }

    debug('waiting for lock (disconnect)');
    await this.lock.acquire();

    debug('releasing interface and closing device');
    await this.device.releaseInterface(INTERFACE_INDEX);
    await this.device.close();

    this.connected = false;
    debug('disconnected');
  }

  /**
   * Low-level method to read data from the device.
   */
  async read(maxLength: number): Promise<Result<Buffer, ErrorCode>> {
    if (!this.connected) {
      return err(ErrorCode.ScannerOffline);
    }

    const getEndpointsResult = this.getReadWriteEndpoints();

    if (getEndpointsResult.isErr()) {
      return getEndpointsResult;
    }

    const [readEndpointNumber] = getEndpointsResult.ok();

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
    if (!this.connected) {
      return err(ErrorCode.ScannerOffline);
    }

    const getEndpointsResult = this.getReadWriteEndpoints();

    if (getEndpointsResult.isErr()) {
      return getEndpointsResult;
    }

    let outResult!: USBOutTransferResult;
    const [, writeEndpointNumber] = getEndpointsResult.ok();

    for (let i = 0; i < WRITE_RETRY_MAX; i += 1) {
      debug('sending request (attempt %d/%d)', i + 1, WRITE_RETRY_MAX);
      outResult = await this.device.transferOut(writeEndpointNumber, data);

      if (outResult.status !== 'ok') {
        debug('send failed (status=%s)', outResult.status);
        await this.device.clearHalt('out', writeEndpointNumber);
        break;
      }

      if (outResult.bytesWritten !== data.length) {
        debug(
          'send failed (bytesWritten=%d, expected=%d)',
          outResult.bytesWritten,
          data.length
        );
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
   * Performs a `write` followed by a `read`.
   */
  async writeRead(
    data: Buffer,
    maxLength: number
  ): Promise<Result<Buffer, ErrorCode>> {
    const writeResult = await this.write(data);

    if (writeResult.isErr()) {
      return writeResult;
    }

    return this.read(maxLength);
  }

  /**
   * Runs the given function with the device locked.
   */
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.lock.acquire();

    try {
      return await fn();
    } finally {
      this.lock.release();
    }
  }

  /**
   * Gets the read and write endpoints for communicating with the device.
   */
  private getReadWriteEndpoints(): Result<
    [read: number, write: number],
    ErrorCode
  > {
    try {
      const readEndpointNumber =
        this.device.configurations[0]?.interfaces[INTERFACE_INDEX]?.alternate
          .endpoints[READ_ENDPOINT_INDEX]?.endpointNumber;
      const writeEndpointNumber =
        this.device.configurations[0]?.interfaces[INTERFACE_INDEX]?.alternate
          .endpoints[WRITE_ENDPOINT_INDEX]?.endpointNumber;

      if (
        typeof readEndpointNumber === 'undefined' ||
        typeof writeEndpointNumber === 'undefined'
      ) {
        debug('unable to find read/write endpoints');
        return err(ErrorCode.OpenDeviceError);
      }

      debug(
        'got endpoints: read=%s, write=%s',
        readEndpointNumber,
        writeEndpointNumber
      );
      return ok([readEndpointNumber, writeEndpointNumber]);
    } catch (error) {
      debug('uncaught USB error: %o', error);
      return err(ErrorCode.CommunicationUnknownError);
    }
  }
}
