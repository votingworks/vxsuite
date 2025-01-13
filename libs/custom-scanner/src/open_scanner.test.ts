import { expect, test, vi } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { Device, findByIds, WebUSBDevice } from 'usb';
import { CustomA4Scanner } from './custom_a4_scanner';
import { mockCustomA4ScannerWebUsbDevice } from './mocks';
import { openScanner } from './open_scanner';
import { ErrorCode } from './types';

vi.mock(import('usb'));

const findByIdsMock = vi.mocked(findByIds);
const createInstanceMock = vi.mocked(WebUSBDevice.createInstance);

test('no Custom A4 device present', async () => {
  findByIdsMock.mockReturnValueOnce(undefined);
  const openScannerResult = await openScanner();
  expect(openScannerResult).toEqual(err(ErrorCode.ScannerOffline));
});

test('unexpected error during open', async () => {
  const legacyDevice = {} as unknown as Device;
  findByIdsMock.mockReturnValueOnce(legacyDevice);
  createInstanceMock.mockRejectedValueOnce(new Error('test'));

  const openScannerResult = await openScanner();
  expect(openScannerResult).toEqual(err(ErrorCode.OpenDeviceError));
});

test('connect success', async () => {
  const legacyDevice = {} as unknown as Device;
  const usbDevice = mockCustomA4ScannerWebUsbDevice();
  findByIdsMock.mockReturnValueOnce(legacyDevice);
  createInstanceMock.mockResolvedValueOnce(
    usbDevice as unknown as WebUSBDevice
  );

  const openScannerResult = await openScanner();
  expect(openScannerResult).toEqual(ok(expect.any(CustomA4Scanner)));
  expect(createInstanceMock).toHaveBeenCalledWith(legacyDevice);
});

test('connect error', async () => {
  const legacyDevice = {} as unknown as Device;
  const usbDevice = mockCustomA4ScannerWebUsbDevice();
  findByIdsMock.mockReturnValueOnce(legacyDevice);
  createInstanceMock.mockResolvedValueOnce(
    usbDevice as unknown as WebUSBDevice
  );

  usbDevice.mockOnOpen(() => {
    throw new Error('test');
  });
  const openScannerResult = await openScanner();
  expect(openScannerResult).toEqual(err(ErrorCode.CommunicationUnknownError));
});
