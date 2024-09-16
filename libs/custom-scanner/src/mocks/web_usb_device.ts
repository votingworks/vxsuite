import { Buffer } from 'node:buffer';
import { debug as baseDebug } from '../debug';

const debug = baseDebug.extend('mock-usb-device');

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ignore(...args: unknown[]): void {
  // do nothing
}

type NonReadonly<T> = {
  -readonly [K in keyof T]: T[K] extends object ? NonReadonly<T[K]> : T[K];
};

type MutableUsbConfiguration = NonReadonly<USBConfiguration>;

/**
 * A mock implementation of the WebUSB API's `USBDevice` class.
 */
export class MockWebUsbDevice implements USBDevice {
  private mockIsOpened = false;
  private mockSelectedConfigurationValue?: number;
  private readonly mockConfigurations = new Set<MutableUsbConfiguration>();
  private readonly mockOnOpenCallbacks: Array<() => void | Promise<void>> = [];
  private readonly mockTransferInBuffer = new Map<number, Buffer>();
  private readonly mockTransferOutBuffers = new Map<number, Buffer[]>();
  private readonly mockStalledEndpoints = new Set<number>();
  private readonly mockNextTransferLimit = new Map<number, number[]>();

  get usbVersionMajor(): number {
    return 0;
  }

  get usbVersionMinor(): number {
    return 0;
  }

  get usbVersionSubminor(): number {
    return 0;
  }

  get deviceClass(): number {
    return 0;
  }

  get deviceSubclass(): number {
    return 0;
  }

  get deviceProtocol(): number {
    return 0;
  }

  get vendorId(): number {
    return 0;
  }

  get productId(): number {
    return 0;
  }

  get deviceVersionMajor(): number {
    return 0;
  }

  get deviceVersionMinor(): number {
    return 0;
  }

  get deviceVersionSubminor(): number {
    return 0;
  }

  get manufacturerName(): string | undefined {
    return 'mock manufacturer';
  }

  get productName(): string | undefined {
    return 'mock product';
  }

  get serialNumber(): string | undefined {
    return 'mock serial number';
  }

  get configuration(): USBConfiguration | undefined {
    return this.mockConfiguration;
  }

  private get mockConfiguration(): MutableUsbConfiguration | undefined {
    for (const configuration of this.mockConfigurations) {
      if (
        configuration.configurationValue === this.mockSelectedConfigurationValue
      ) {
        return configuration;
      }
    }

    return undefined;
  }

  get configurations(): USBConfiguration[] {
    return [...this.mockConfigurations];
  }

  get opened(): boolean {
    return this.mockIsOpened;
  }

  async open(): Promise<void> {
    this.mockIsOpened = true;
    for (const callback of this.mockOnOpenCallbacks) {
      await callback();
    }
  }

  close(): Promise<void> {
    this.mockIsOpened = false;

    for (const configuration of this.mockConfigurations) {
      for (const usbInterface of configuration.interfaces) {
        usbInterface.claimed = false;
      }
    }

    this.mockTransferInBuffer.clear();
    this.mockTransferOutBuffers.clear();
    this.mockStalledEndpoints.clear();
    this.mockNextTransferLimit.clear();
    return Promise.resolve();
  }

  async forget(): Promise<void> {
    // NOTE: per the documentation, this should also abort any pending transfers
    // however, since this mock is effectively synchronous, there are no pending
    // transfers to abort
    await this.close();
  }

  selectConfiguration(configurationValue: number): Promise<void> {
    if (!this.opened) {
      return Promise.reject(new Error('device not opened'));
    }

    const configuration = [...this.mockConfigurations].find(
      (c) => c.configurationValue === configurationValue
    );

    if (!configuration) {
      return Promise.reject(new Error('configuration not selected'));
    }

    this.mockSelectedConfigurationValue = configurationValue;
    return Promise.resolve();
  }

  async claimInterface(interfaceNumber: number): Promise<void> {
    const usbInterface = await this.getInterface(interfaceNumber);

    if (usbInterface.claimed) {
      throw new Error('interface already claimed');
    }

    usbInterface.claimed = true;
  }

  async releaseInterface(interfaceNumber: number): Promise<void> {
    const usbInterface = await this.getInterface(interfaceNumber);

    if (!usbInterface.claimed) {
      throw new Error('interface not claimed');
    }

    usbInterface.claimed = false;
    return Promise.resolve();
  }

  async selectAlternateInterface(
    interfaceNumber: number,
    alternateSetting: number
  ): Promise<void> {
    const usbInterface = await this.getInterface(interfaceNumber);

    if (!usbInterface.claimed) {
      throw new Error('interface not claimed');
    }

    const alternate = usbInterface.alternates.find(
      (a) => a.alternateSetting === alternateSetting
    );

    if (!alternate) {
      throw new Error('alternate setting not found');
    }

    usbInterface.alternate = alternate;
  }

  controlTransferIn(
    setup: USBControlTransferParameters,
    length: number
  ): Promise<USBInTransferResult> {
    ignore(setup, length);
    throw new Error('not implemented');
  }

  controlTransferOut(
    setup: USBControlTransferParameters,
    data?: BufferSource
  ): Promise<USBOutTransferResult> {
    ignore(setup, data);
    throw new Error('not implemented');
  }

  async clearHalt(
    direction: USBDirection,
    endpointNumber: number
  ): Promise<void> {
    const endpoint = await this.getEndpoint(endpointNumber);

    if (endpoint.direction !== direction) {
      throw new Error('endpoint direction does not match');
    }

    debug('clearHalt(%o, %o)', direction, endpointNumber);
    this.mockStalledEndpoints.delete(endpointNumber);
  }

  async transferIn(
    endpointNumber: number,
    length: number
  ): Promise<USBInTransferResult> {
    const endpoint = await this.getInEndpoint(endpointNumber);

    debug('transferIn(%o, %o)', endpoint, length);

    if (this.mockStalledEndpoints.has(endpointNumber)) {
      return { status: 'stall' };
    }

    const buffer = this.mockTransferInBuffer.get(endpointNumber);
    const transferInLimit = this.mockNextTransferLimit
      .get(endpointNumber)
      ?.shift();
    const numBytesToRead = transferInLimit ?? length;
    this.mockTransferInBuffer.set(
      endpointNumber,
      buffer?.subarray(numBytesToRead) ?? Buffer.alloc(0)
    );
    const readBuffer = buffer?.subarray(0, numBytesToRead) ?? Buffer.alloc(0);
    const uint8Array = new Uint8Array(readBuffer);
    readBuffer.copy(uint8Array, 0, 0, readBuffer.byteLength);
    const data = new DataView(uint8Array.buffer, 0, uint8Array.byteLength);
    return { status: 'ok', data };
  }

  async transferOut(
    endpointNumber: number,
    data: BufferSource
  ): Promise<USBOutTransferResult> {
    const endpoint = await this.getOutEndpoint(endpointNumber);

    debug('transferOut(%o, %o)', endpoint, data);

    if (this.mockStalledEndpoints.has(endpointNumber)) {
      return { status: 'stall', bytesWritten: 0 };
    }

    const transferOutLimit = this.mockNextTransferLimit
      .get(endpointNumber)
      ?.shift();
    const bytesWritten = transferOutLimit ?? data.byteLength;

    this.mockTransferOutBuffers.set(endpointNumber, [
      ...(this.mockTransferOutBuffers.get(endpointNumber) || []),
      ArrayBuffer.isView(data)
        ? Buffer.from(data.buffer, data.byteOffset, bytesWritten)
        : Buffer.from(data),
    ]);
    return { status: 'ok', bytesWritten };
  }

  isochronousTransferIn(
    endpointNumber: number,
    packetLengths: number[]
  ): Promise<USBIsochronousInTransferResult> {
    ignore(endpointNumber, packetLengths);
    throw new Error('not implemented');
  }

  isochronousTransferOut(
    endpointNumber: number,
    data: BufferSource,
    packetLengths: number[]
  ): Promise<USBIsochronousOutTransferResult> {
    ignore(endpointNumber, data, packetLengths);
    throw new Error('not implemented');
  }

  reset(): Promise<void> {
    throw new Error('not implemented');
  }

  private async getInterface(
    interfaceNumber: number
  ): Promise<NonReadonly<USBInterface>> {
    await Promise.resolve();

    if (!this.opened) {
      throw new Error('device not opened');
    }

    const configuration = this.mockConfiguration;

    if (!configuration) {
      throw new Error('configuration not selected');
    }

    const usbInterface = configuration.interfaces.find(
      (i) => i.interfaceNumber === interfaceNumber
    );

    if (!usbInterface) {
      throw new Error('interface not found');
    }

    return usbInterface;
  }

  private async getEndpoint(
    endpointNumber: number
  ): Promise<NonReadonly<USBEndpoint>> {
    await Promise.resolve();

    if (!this.opened) {
      throw new Error('device not opened');
    }

    const configuration = this.mockConfiguration;

    if (!configuration) {
      throw new Error('configuration not selected');
    }

    for (const usbInterface of configuration.interfaces) {
      if (usbInterface.claimed) {
        for (const endpoint of usbInterface.alternate.endpoints) {
          if (endpoint.endpointNumber === endpointNumber) {
            return endpoint;
          }
        }
      }
    }

    throw new Error('endpoint not found');
  }

  private async getInEndpoint(
    endpointNumber: number
  ): Promise<NonReadonly<USBEndpoint>> {
    const endpoint = await this.getEndpoint(endpointNumber);

    if (endpoint.direction === 'out') {
      throw new Error('endpoint direction is out');
    }

    return endpoint;
  }

  private async getOutEndpoint(
    endpointNumber: number
  ): Promise<NonReadonly<USBEndpoint>> {
    const endpoint = await this.getEndpoint(endpointNumber);

    if (endpoint.direction === 'in') {
      throw new Error('endpoint direction is in');
    }

    return endpoint;
  }

  mockSetConfiguration(configuration: USBConfiguration): void {
    for (const existingConfiguration of this.mockConfigurations) {
      if (
        existingConfiguration.configurationValue ===
        configuration.configurationValue
      ) {
        this.mockConfigurations.delete(existingConfiguration);
      }
    }

    this.mockConfigurations.add(JSON.parse(JSON.stringify(configuration)));
  }

  mockOnOpen(callback: () => void): void {
    this.mockOnOpenCallbacks.push(callback);
  }

  async mockAddTransferInData(
    endpointNumber: number,
    data: Buffer
  ): Promise<void> {
    const endpoint = await this.getInEndpoint(endpointNumber);

    debug('mockAddTransferInData(%o, %o)', endpoint, data);
    this.mockTransferInBuffer.set(
      endpointNumber,
      Buffer.concat([
        this.mockTransferInBuffer.get(endpointNumber) || Buffer.alloc(0),
        data,
      ])
    );
  }

  async mockGetTransferOutData(endpointNumber: number): Promise<Buffer[]> {
    const endpoint = await this.getOutEndpoint(endpointNumber);
    debug('mockGetTransferOutData(%o)', endpoint);
    return this.mockTransferOutBuffers.get(endpointNumber) ?? [];
  }

  async mockStallEndpoint(endpointNumber: number): Promise<void> {
    const endpoint = await this.getEndpoint(endpointNumber);
    debug('mockStallEndpoint(%o)', endpoint);
    this.mockStalledEndpoints.add(endpointNumber);
  }

  async mockIsEndpointStalled(endpointNumber: number): Promise<boolean> {
    const endpoint = await this.getEndpoint(endpointNumber);
    debug('mockIsEndpointStalled(%o)', endpoint);
    return this.mockStalledEndpoints.has(endpointNumber);
  }

  async mockLimitNextTransferInSize(
    endpointNumber: number,
    byteLength: number
  ): Promise<void> {
    const endpoint = await this.getInEndpoint(endpointNumber);

    debug('mockLimitNextTransferInSize(%o, %o)', endpoint, byteLength);
    this.mockNextTransferLimit.set(endpointNumber, [
      ...(this.mockNextTransferLimit.get(endpointNumber) ?? []),
      byteLength,
    ]);
  }

  async mockLimitNextTransferOutSize(
    endpointNumber: number,
    byteLength: number
  ): Promise<void> {
    const endpoint = await this.getOutEndpoint(endpointNumber);

    debug('mockLimitNextTransferOutSize(%o, %o)', endpoint, byteLength);
    this.mockNextTransferLimit.set(endpointNumber, [
      ...(this.mockNextTransferLimit.get(endpointNumber) ?? []),
      byteLength,
    ]);
  }
}

/**
 * Builds a mock WebUSBDevice.
 */
export function mockWebUsbDevice(): MockWebUsbDevice {
  return new MockWebUsbDevice();
}
