/* eslint-disable vx/gts-no-array-constructor */
import { expect, Mocked, test, vi } from 'vitest';
import { Device, findByIds, WebUSBDevice } from 'usb';
import { LogEventId, mockLogger } from '@votingworks/logging';
import { readFileSync } from 'node:fs';
import { createImageData, ImageData } from '@votingworks/image-utils';
import { assertDefined, iter, ok } from '@votingworks/basics';
import {
  BYTES_PER_BIT_IMAGE_ROW,
  chunkImageData,
  compressBitImage,
  imageDataToBitImage,
  packBitsCompression,
  PAGE_DOTS_WIDTH,
  printImageData,
  printPdf,
  trimImageDataToPageWidth,
} from './printing.js';
import { getFujitsuThermalPrinter } from './printer.js';
import {
  CONFIGURATION_NUMBER,
  FujitsuThermalPrinterDriverInterface,
  INTERFACE_NUMBER,
  PrinterStatusResponse,
  PRODUCT_ID,
  RawPrinterStatus,
  VENDOR_ID,
} from './driver/index.js';
import { CompressedBitImage } from './driver/types.js';
import { IDLE_REPLY_PARAMETER } from './globals.js';
import { mockMinimalWebUsbDevice } from '../test/mock_minimal_web_usb_device.js';
import { singlePageReportPath } from '../test/fixtures/index.js';

const LETTER_DOTS_WIDTH = 8.5 * 200;
const BYTES_PER_PIXEL = 4;

function imageDataWithRowMarkers(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * BYTES_PER_PIXEL);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[(y * width + x) * BYTES_PER_PIXEL] = y % 256;
      data[(y * width + x) * BYTES_PER_PIXEL + 1] = x % 256;
      data[(y * width + x) * BYTES_PER_PIXEL + 3] = 0xff;
    }
  }
  return createImageData(data, width, height);
}

function pixelAt(imageData: ImageData, x: number, y: number) {
  const offset = (y * imageData.width + x) * BYTES_PER_PIXEL;
  return [
    imageData.data[offset],
    imageData.data[offset + 1],
    imageData.data[offset + 2],
    imageData.data[offset + 3],
  ];
}

test('trimImageDataToPageWidth centers the printable area', () => {
  const height = 5;
  const trimmed = trimImageDataToPageWidth(
    imageDataWithRowMarkers(LETTER_DOTS_WIDTH, height)
  );

  expect(trimmed.width).toEqual(PAGE_DOTS_WIDTH);
  expect(trimmed.height).toEqual(height);
  expect(trimmed.data.length).toEqual(
    PAGE_DOTS_WIDTH * height * BYTES_PER_PIXEL
  );

  const trimLeft = (LETTER_DOTS_WIDTH - PAGE_DOTS_WIDTH) / 2;
  for (let y = 0; y < height; y += 1) {
    expect(pixelAt(trimmed, 0, y)).toEqual([y, trimLeft % 256, 0, 0xff]);
    expect(pixelAt(trimmed, PAGE_DOTS_WIDTH - 1, y)).toEqual([
      y,
      (trimLeft + PAGE_DOTS_WIDTH - 1) % 256,
      0,
      0xff,
    ]);
  }
});

test('trimImageDataToPageWidth requires a letter-width page', () => {
  expect(() =>
    trimImageDataToPageWidth(imageDataWithRowMarkers(PAGE_DOTS_WIDTH, 1))
  ).toThrow();
});

test('chunkImageData splits into driver-sized chunks preserving rows', () => {
  const height = 1801;
  const chunks = iter(
    chunkImageData(imageDataWithRowMarkers(PAGE_DOTS_WIDTH, height))
  ).toArray();

  expect(chunks.map((chunk) => chunk.height)).toEqual([800, 800, 201]);
  expect(chunks.every((chunk) => chunk.width === PAGE_DOTS_WIDTH)).toEqual(
    true
  );

  let y = 0;
  for (const chunk of chunks) {
    expect(chunk.data.length).toEqual(
      PAGE_DOTS_WIDTH * chunk.height * BYTES_PER_PIXEL
    );
    for (let chunkY = 0; chunkY < chunk.height; chunkY += 1, y += 1) {
      expect(pixelAt(chunk, 0, chunkY)).toEqual([y % 256, 0, 0, 0xff]);
    }
  }
  expect(y).toEqual(height);
});

test('chunkImageData requires page-width image data', () => {
  expect(() =>
    iter(
      chunkImageData(imageDataWithRowMarkers(LETTER_DOTS_WIDTH, 1))
    ).toArray()
  ).toThrow();
});

function whiteImage(width: number, height: number): ImageData {
  const imageData = createImageData(width, height);
  imageData.data.fill(255);
  return imageData;
}

function paintGray(imageData: ImageData, x: number, y: number, gray: number) {
  imageData.data.set([gray, gray, gray, 255], (y * imageData.width + x) * 4);
}

function paintBlack(imageData: ImageData, x: number, y: number) {
  paintGray(imageData, x, y, 0);
}

/** Asserts the given bytes of a bit image row, and that all others are 0. */
function expectRowBytes(
  bitImageData: Uint8Array,
  row: number,
  expectedBytes: Record<number, number>
) {
  const rowBytes = bitImageData.subarray(
    row * BYTES_PER_BIT_IMAGE_ROW,
    (row + 1) * BYTES_PER_BIT_IMAGE_ROW
  );
  const expected: number[] = Object.assign(
    Array(BYTES_PER_BIT_IMAGE_ROW).fill(0),
    expectedBytes
  );
  expect(Array.from(rowBytes)).toEqual(expected);
}

/** Inverse of `packBitsCompression`. */
function unpackBits(data: Int8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const header = data[i] as number;
    if (header >= 0) {
      out.push(...data.subarray(i + 1, i + 2 + header));
      i += header + 2;
    } else {
      const byte = data[i + 1] as number;
      for (let n = 0; n < 1 - header; n += 1) out.push(byte);
      i += 2;
    }
  }
  return new Uint8Array(out);
}

test('imageDataToBitImage packs pixels MSB-first, black = 1', () => {
  const imageData = whiteImage(PAGE_DOTS_WIDTH, 4);
  // row 0: dots 0 and 7 are black
  paintBlack(imageData, 0, 0);
  paintBlack(imageData, 7, 0);
  // row 1: the last dot is black
  paintBlack(imageData, PAGE_DOTS_WIDTH - 1, 1);
  // row 2: gray 229 is black, gray 231 is white (230 itself is a hair below
  // the threshold in floating point)
  paintGray(imageData, 0, 2, 229);
  paintGray(imageData, 1, 2, 231);
  // row 3: dot 8 is the first dot of the second byte
  paintBlack(imageData, 8, 3);

  const bitImage = imageDataToBitImage(imageData);
  expect(bitImage.compressed).toEqual(false);
  expect(bitImage.height).toEqual(4);
  expect(bitImage.data).toHaveLength(4 * BYTES_PER_BIT_IMAGE_ROW);
  expectRowBytes(bitImage.data, 0, { 0: 0b1000_0001 });
  expectRowBytes(bitImage.data, 1, {
    [BYTES_PER_BIT_IMAGE_ROW - 1]: 0b0000_0001,
  });
  expectRowBytes(bitImage.data, 2, { 0: 0b1000_0000 });
  expectRowBytes(bitImage.data, 3, { 1: 0b1000_0000 });
});

test('imageDataToBitImage requires page-width image data', () => {
  expect(() => imageDataToBitImage(whiteImage(LETTER_DOTS_WIDTH, 1))).toThrow(
    'Image width must be 1696, got 1700'
  );
});

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
    {
      uncompressed: Array.from({ length: 130 }, (_, i) => (i % 2) + 1),
      compressed: [
        127,
        ...Array.from({ length: 128 }, (_, i) => (i % 2) + 1),
        1,
        1,
        2,
      ],
    },
    { uncompressed: [200, 200, 201], compressed: [-1, -56, 0, -55] },
    { uncompressed: [], compressed: [] },
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

const idleRawStatus: RawPrinterStatus = {
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

/** Driver mock whose status echoes the last reply parameter set. */
function mockDriver(): Mocked<FujitsuThermalPrinterDriverInterface> {
  let replyParameter = 0;
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    resetPrinter: vi.fn(),
    setPrintQuality: vi.fn(),
    feedForward: vi.fn(),
    setReplyParameter: vi.fn().mockImplementation((parameter: number) => {
      replyParameter = parameter;
      return Promise.resolve();
    }),
    getStatus: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve({ ...idleRawStatus, replyParameter })
      ),
    printBitImage: vi.fn().mockResolvedValue(undefined),
  };
}

function printedBitImages(
  driver: Mocked<FujitsuThermalPrinterDriverInterface>
): CompressedBitImage[] {
  return driver.printBitImage.mock.calls.map(([bitImage]) => bitImage);
}

test('printPdf sends one compressed bit image per 800-row band', async () => {
  const driver = mockDriver();
  const result = await printPdf(driver, readFileSync(singlePageReportPath));
  expect(result).toEqual(ok());

  // 8.5" x 11" at 200 DPI = 1700 x 2200 px
  const bitImages = printedBitImages(driver);
  expect(bitImages.map((bitImage) => bitImage.height)).toEqual([800, 800, 600]);
  for (const bitImage of bitImages) {
    expect(bitImage.compressed).toEqual(true);
    const unpacked = unpackBits(bitImage.data);
    expect(unpacked).toHaveLength(bitImage.height * BYTES_PER_BIT_IMAGE_ROW);
    expect(unpacked.some((byte) => byte !== 0)).toEqual(true);
  }
  expect(driver.setReplyParameter).toHaveBeenLastCalledWith(
    IDLE_REPLY_PARAMETER
  );
});

test('printImageData prints page-width image data', async () => {
  const imageData = whiteImage(PAGE_DOTS_WIDTH, 5);
  paintBlack(imageData, PAGE_DOTS_WIDTH - 1, 4);

  const driver = mockDriver();
  const result = await printImageData(driver, imageData);
  expect(result).toEqual(ok());

  const [bitImage] = printedBitImages(driver);
  expect(bitImage?.height).toEqual(5);
  expectRowBytes(unpackBits(assertDefined(bitImage).data), 4, {
    [BYTES_PER_BIT_IMAGE_ROW - 1]: 0b0000_0001,
  });
  expect(driver.setReplyParameter).toHaveBeenLastCalledWith(
    IDLE_REPLY_PARAMETER
  );
});

test('printImageData requires page-width image data', async () => {
  await expect(
    printImageData(mockDriver(), whiteImage(LETTER_DOTS_WIDTH, 1))
  ).rejects.toThrow('Image width must be 1696, got 1700');
});
