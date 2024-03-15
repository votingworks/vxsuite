import { err, ok } from '@votingworks/basics';
import { expect, test } from 'bun:test';
import { Buffer } from 'buffer';
import {
  mockCustomA4ScannerWebUsbDevice,
  mockCustomA4ScannerWebUsbDeviceWithoutEndpoints,
  mockWebUsbDevice,
} from './mocks';
import { UsbChannel } from './usb_channel';
import { ErrorCode } from './types';
import { CustomA4ScannerChannelOptions } from './open_scanner';

function createUsbChannel(device = mockCustomA4ScannerWebUsbDevice()) {
  return new UsbChannel(device, CustomA4ScannerChannelOptions);
}

test('connect/disconnect', async () => {
  const channel = createUsbChannel();
  await channel.disconnect();
  expect(await channel.connect()).toEqual(ok());
  expect(await channel.connect()).toEqual(ok());
  await channel.disconnect();
});

test('connect with a channel with no configurations', async () => {
  const incompatibleDevice = mockWebUsbDevice();
  const channel = createUsbChannel(incompatibleDevice);
  expect(await channel.connect()).toEqual(
    err(ErrorCode.CommunicationUnknownError)
  );
});

test('connect with missing endpoints', async () => {
  const a4ScannerDevice = mockCustomA4ScannerWebUsbDeviceWithoutEndpoints();
  const channel = createUsbChannel(a4ScannerDevice);
  expect(await channel.connect()).toEqual(err(ErrorCode.OpenDeviceError));
});

test('read before connect', async () => {
  const a4ScannerDevice = mockCustomA4ScannerWebUsbDevice();
  const channel = createUsbChannel(a4ScannerDevice);
  expect(await channel.read(1)).toEqual(err(ErrorCode.ScannerOffline));
});

test('read with no data', async () => {
  const a4ScannerDevice = mockCustomA4ScannerWebUsbDevice();
  const channel = createUsbChannel(a4ScannerDevice);
  expect(await channel.connect()).toEqual(ok());
  expect(await channel.read(1)).toEqual(err(ErrorCode.NoDeviceAnswer));
});

test('read with less data than requested', async () => {
  const a4ScannerDevice = mockCustomA4ScannerWebUsbDevice();
  const channel = createUsbChannel(a4ScannerDevice);
  expect(await channel.connect()).toEqual(ok());

  await a4ScannerDevice.mockAddTransferInData(1, Buffer.from([0x01]));
  expect(await channel.read(10)).toEqual(ok(Buffer.from([0x01])));
});

test('read with more data than requested', async () => {
  const a4ScannerDevice = mockCustomA4ScannerWebUsbDevice();
  const channel = createUsbChannel(a4ScannerDevice);
  expect(await channel.connect()).toEqual(ok());

  await a4ScannerDevice.mockAddTransferInData(1, Buffer.from('hello world!'));
  expect(await channel.read(10)).toEqual(ok(Buffer.from('hello worl')));
  expect(await channel.read(10)).toEqual(ok(Buffer.from('d!')));
});

test('read clear halt', async () => {
  const a4ScannerDevice = mockCustomA4ScannerWebUsbDevice();
  const channel = createUsbChannel(a4ScannerDevice);
  expect(await channel.connect()).toEqual(ok());

  await a4ScannerDevice.mockStallEndpoint(1);
  await a4ScannerDevice.mockAddTransferInData(1, Buffer.from('hello world!'));
  expect(await channel.read(10)).toEqual(ok(Buffer.from('hello worl')));
  expect(await a4ScannerDevice.mockIsEndpointStalled(1)).toEqual(false);
});

test('write before connect', async () => {
  const a4ScannerDevice = mockCustomA4ScannerWebUsbDevice();
  const channel = createUsbChannel(a4ScannerDevice);
  expect(await channel.write(Buffer.alloc(0))).toEqual(
    err(ErrorCode.ScannerOffline)
  );
});

test('write', async () => {
  const a4ScannerDevice = mockCustomA4ScannerWebUsbDevice();
  const channel = createUsbChannel(a4ScannerDevice);
  expect(await channel.connect()).toEqual(ok());

  expect(await channel.write(Buffer.from('hello world!'))).toEqual(ok());
  expect(await a4ScannerDevice.mockGetTransferOutData(2)).toEqual([
    Buffer.from('hello world!'),
  ]);
});

test('write clear halt', async () => {
  const a4ScannerDevice = mockCustomA4ScannerWebUsbDevice();
  const channel = createUsbChannel(a4ScannerDevice);
  expect(await channel.connect()).toEqual(ok());

  await a4ScannerDevice.mockStallEndpoint(2);
  expect(await channel.write(Buffer.from('hello world!'))).toEqual(ok());
  expect(await a4ScannerDevice.mockGetTransferOutData(2)).toEqual([
    Buffer.from('hello world!'),
  ]);
  expect(await a4ScannerDevice.mockIsEndpointStalled(2)).toEqual(false);
});

test('write in multiple transfers', async () => {
  const a4ScannerDevice = mockCustomA4ScannerWebUsbDevice();
  const channel = createUsbChannel(a4ScannerDevice);
  expect(await channel.connect()).toEqual(ok());

  await a4ScannerDevice.mockLimitNextTransferOutSize(2, 5);
  expect(await channel.write(Buffer.from('hello world!'))).toEqual(ok());
  expect(await a4ScannerDevice.mockGetTransferOutData(2)).toEqual([
    Buffer.from('hello'),
    Buffer.from(' world!'),
  ]);
});

test('write error', async () => {
  const a4ScannerDevice = mockCustomA4ScannerWebUsbDevice();
  const channel = createUsbChannel(a4ScannerDevice);
  expect(await channel.connect()).toEqual(ok());

  // we retry 5 times
  await a4ScannerDevice.mockLimitNextTransferOutSize(2, 1);
  await a4ScannerDevice.mockLimitNextTransferOutSize(2, 1);
  await a4ScannerDevice.mockLimitNextTransferOutSize(2, 1);
  await a4ScannerDevice.mockLimitNextTransferOutSize(2, 1);
  await a4ScannerDevice.mockLimitNextTransferOutSize(2, 1);
  await a4ScannerDevice.mockLimitNextTransferOutSize(2, 1);
  await a4ScannerDevice.mockLimitNextTransferOutSize(2, 1);
  expect(await channel.write(Buffer.from('hello world!'))).toEqual(
    err(ErrorCode.WriteError)
  );
});
