/* eslint-disable vx/gts-no-array-constructor */
import { expect, test, vi } from 'vitest';
import { Device, findByIds, WebUSBDevice } from 'usb';
import { LogEventId, mockLogger } from '@votingworks/logging';
import { compressBitImage, packBitsCompression } from './printing';
import { getFujitsuThermalPrinter } from './printer';
import {
  CONFIGURATION_NUMBER,
  INTERFACE_NUMBER,
  PrinterStatusResponse,
  PRODUCT_ID,
  RawPrinterStatus,
  VENDOR_ID,
} from './driver';
import { mockMinimalWebUsbDevice } from '../test/mock_minimal_web_usb_device';

test('packBitsCompression', () => {
  const testCases: Array<{ uncompressed: number[]; compressed: number[] }> = [
    {
      uncompressed: [3, 3, 3],
      compressed: [-2, 3],
    },
    {
      uncompressed: [3, 3, 3, 3, 3],
      compressed: [-4, 3],
    },
    {
      uncompressed: [1, 2, 3],
      compressed: [2, 1, 2, 3],
    },
    {
      uncompressed: [1, 2, 3, 4, 5],
      compressed: [4, 1, 2, 3, 4, 5],
    },
    {
      uncompressed: [3, 3, 3, 3, 3, 1, 2, 3, 5, 5, 5, 5, 5],
      compressed: [-4, 3, 2, 1, 2, 3, -4, 5],
    },
    { uncompressed: Array(128).fill(4), compressed: [-127, 4] },
    { uncompressed: Array(200).fill(4), compressed: [-127, 4, -71, 4] },
    { uncompressed: [3, ...Array(128).fill(4)], compressed: [0, 3, -127, 4] },
    { uncompressed: [...Array(128).fill(4), 3], compressed: [-127, 4, 0, 3] },
  ];

  for (const testCase of testCases) {
    expect(packBitsCompression(new Uint8Array(testCase.uncompressed))).toEqual(
      new Int8Array(testCase.compressed)
    );
  }
});

test('compressBitImage', () => {
  expect(
    compressBitImage({
      height: 10,
      data: new Uint8Array([1, 2, 3, 4, 5]),
      compressed: false,
    })
  ).toEqual({
    height: 10,
    data: new Int8Array([4, 1, 2, 3, 4, 5]),
    compressed: true,
  });
});

vi.mock(import('usb'));

const findByIdsMock = vi.mocked(findByIds);
const createInstanceMock = vi.mocked(WebUSBDevice.createInstance);
const logger = mockLogger({ fn: vi.fn });

const legacyDevice = {
  open: vi.fn(),
  interfaces: [],
} as unknown as Device;

test('initially disconnected', async () => {
  findByIdsMock.mockReturnValueOnce(undefined);
  const printer = getFujitsuThermalPrinter(logger);
  expect(await printer.getStatus()).toEqual({
    state: 'error',
    type: 'disconnected',
    message: 'Printer not found',
  });
  expect(findByIdsMock).toHaveBeenCalledWith(VENDOR_ID, PRODUCT_ID);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.PrinterStatusChanged,
    'system',
    expect.objectContaining({
      status:
        '{"state":"error","type":"disconnected","message":"Printer not found"}',
    })
  );

  findByIdsMock.mockReturnValueOnce(legacyDevice);
  createInstanceMock.mockRejectedValueOnce(new Error('test error'));
  expect(await printer.getStatus()).toEqual({
    state: 'error',
    type: 'disconnected',
    message: 'Error initializing WebUSBDevice with message: test error',
  });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.PrinterStatusChanged,
    'system',
    expect.objectContaining({
      status:
        '{"state":"error","type":"disconnected","message":"Error initializing WebUSBDevice with message: test error"}',
    })
  );
});

const idleStatus: RawPrinterStatus = {
  paperFeedSensor: false,
  isOffline: false,
  isBufferFull: false,
  temperatureError: false,
  hardwareError: false,
  isPaperCoverOpen: false,
  receiveDataError: false,
  supplyVoltageError: false,
  isPaperAtEnd: false,
  markUndetection: false,
  isPaperNearEnd: false,
  replyParameter: 0,
};

const idleStatusResponse: USBInTransferResult = {
  status: 'ok',
  data: new DataView(
    PrinterStatusResponse.encode(idleStatus).unsafeUnwrap().buffer
  ),
};

test('initially connected', async () => {
  findByIdsMock.mockReturnValueOnce(legacyDevice);
  const device = mockMinimalWebUsbDevice();
  createInstanceMock.mockResolvedValueOnce(device as unknown as WebUSBDevice);
  const printer = getFujitsuThermalPrinter(logger);
  vi.mocked(device.controlTransferIn).mockResolvedValueOnce(idleStatusResponse);
  expect(await printer.getStatus()).toEqual({ state: 'idle' });
  expect(device.controlTransferIn).toHaveBeenCalledWith(
    {
      requestType: 'vendor',
      recipient: 'interface',
      request: 0x01,
      value: 0x0000,
      index: 0x0000,
    },
    4
  );
  expect(device.selectConfiguration).toHaveBeenCalledWith(CONFIGURATION_NUMBER);
  expect(device.claimInterface).toHaveBeenCalledWith(INTERFACE_NUMBER);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.PrinterStatusChanged,
    'system',
    expect.objectContaining({
      status: '{"state":"idle"}',
    })
  );
});

test('disconnected after initially connected', async () => {
  findByIdsMock.mockReturnValueOnce(legacyDevice);
  const device = mockMinimalWebUsbDevice();
  createInstanceMock.mockResolvedValueOnce(device as unknown as WebUSBDevice);
  const printer = getFujitsuThermalPrinter(logger);
  vi.mocked(device.controlTransferIn).mockResolvedValueOnce(idleStatusResponse);
  expect(await printer.getStatus()).toEqual({ state: 'idle' });

  // On initial disconnect, controlTransferIn returns a stall status.
  vi.mocked(device.controlTransferIn).mockResolvedValueOnce({
    status: 'stall',
  });
  expect(await printer.getStatus()).toEqual({
    state: 'error',
    type: 'disconnected',
    message: "result did not contain data: { status: 'stall' }",
  });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.PrinterStatusChanged,
    'system',
    expect.objectContaining({
      status:
        '{"state":"error","type":"disconnected","message":"result did not contain data: { status: \'stall\' }"}',
    })
  );

  // After that, we should have cleared our cached driver, so we'll try to
  // reconnect on the next getStatus. Simulate a failed reconnect.
  findByIdsMock.mockReturnValueOnce(undefined);
  expect(await printer.getStatus()).toEqual({
    state: 'error',
    type: 'disconnected',
    message: 'Printer not found',
  });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.PrinterStatusChanged,
    'system',
    expect.objectContaining({
      status:
        '{"state":"error","type":"disconnected","message":"Printer not found"}',
    })
  );

  // Once the printer is reconnected, we should be able to reconnect.
  findByIdsMock.mockReturnValueOnce(legacyDevice);
  createInstanceMock.mockResolvedValueOnce(device as unknown as WebUSBDevice);
  vi.mocked(device.controlTransferIn).mockResolvedValueOnce(idleStatusResponse);
  expect(await printer.getStatus()).toEqual({ state: 'idle' });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.PrinterStatusChanged,
    'system',
    expect.objectContaining({
      status: '{"state":"idle"}',
    })
  );
});
