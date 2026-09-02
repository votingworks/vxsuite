/* eslint-disable vx/gts-no-array-constructor */
import { expect, Mocked, test, vi } from 'vitest';
import { Device, findByIds, WebUSBDevice } from 'usb';
import { LogEventId, mockLogger } from '@votingworks/logging';
import { readFileSync } from 'node:fs';
import { createImageData, ImageData } from '@votingworks/image-utils';
import { iter, ok } from '@votingworks/basics';
import {
  compressBitImage,
  imageDataToBitImage,
  imageDataToBitImages,
  packBitsCompression,
  printImageData,
  printPdf,
  rgbToGrayscale,
} from './printing';
import { getFujitsuThermalPrinter } from './printer';
import {
  CONFIGURATION_NUMBER,
  FujitsuThermalPrinterDriverInterface,
  INTERFACE_NUMBER,
  PrinterStatusResponse,
  PRODUCT_ID,
  RawPrinterStatus,
  VENDOR_ID,
} from './driver';
import { CompressedBitImage } from './driver/types';
import {
  IDLE_REPLY_PARAMETER,
  PRINT_ONGOING_REPLY_PARAMETER,
  PRINT_PROCESSING_REPLY_PARAMETER,
} from './globals';
import { mockMinimalWebUsbDevice } from '../test/mock_minimal_web_usb_device';
import { singlePageReportPath } from '../test/fixtures';

const LETTER_WIDTH_DOTS = 1700;
const BYTES_PER_BIT_IMAGE_ROW = 212;
const PRINTABLE_DOTS_WIDTH = BYTES_PER_BIT_IMAGE_ROW * 8;
// The 1700px image is trimmed equally on both sides down to 1696 printable dots.
const TRIM_LEFT = (LETTER_WIDTH_DOTS - PRINTABLE_DOTS_WIDTH) / 2;

function whiteImage(width: number, height: number): ImageData {
  const imageData = createImageData(width, height);
  imageData.data.fill(255);
  return imageData;
}

function setPixel(
  imageData: ImageData,
  x: number,
  y: number,
  [r, g, b]: [number, number, number]
): void {
  const offset = (y * imageData.width + x) * 4;
  imageData.data.set([r, g, b, 255], offset);
}

/** Naive reference for checking the single-pass conversion against. */
function referenceBitImageRow(
  imageData: ImageData,
  y: number,
  whiteThreshold = 230
): number[] {
  const bytes: number[] = [];
  for (let byteIndex = 0; byteIndex < BYTES_PER_BIT_IMAGE_ROW; byteIndex += 1) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      const x = TRIM_LEFT + byteIndex * 8 + bit;
      const offset = (y * imageData.width + x) * 4;
      const gray = rgbToGrayscale(
        imageData.data[offset] as number,
        imageData.data[offset + 1] as number,
        imageData.data[offset + 2] as number
      );
      if (gray < whiteThreshold) {
        byte |= 0x80 >> bit;
      }
    }
    bytes.push(byte);
  }
  return bytes;
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

test('imageDataToBitImage packs trimmed pixels MSB-first, black = 1', () => {
  const imageData = whiteImage(LETTER_WIDTH_DOTS, 3);
  setPixel(imageData, 0, 0, [0, 0, 0]);
  setPixel(imageData, LETTER_WIDTH_DOTS - 1, 0, [0, 0, 0]);
  setPixel(imageData, TRIM_LEFT, 0, [0, 0, 0]);
  setPixel(imageData, TRIM_LEFT + 7, 0, [0, 0, 0]);
  setPixel(imageData, TRIM_LEFT + PRINTABLE_DOTS_WIDTH - 1, 1, [0, 0, 0]);
  setPixel(imageData, TRIM_LEFT + 8, 2, [0, 0, 0]);
  setPixel(imageData, TRIM_LEFT + 16, 2, [229, 229, 229]);
  // a gray of exactly 230 lands just below the threshold in floating point
  setPixel(imageData, TRIM_LEFT + 17, 2, [231, 231, 231]);

  const bitImage = imageDataToBitImage(imageData, 0, 3);
  expect(bitImage.compressed).toEqual(false);
  expect(bitImage.height).toEqual(3);
  expect(bitImage.data).toHaveLength(3 * BYTES_PER_BIT_IMAGE_ROW);

  function row(y: number): number[] {
    return Array.from(
      bitImage.data.subarray(
        y * BYTES_PER_BIT_IMAGE_ROW,
        (y + 1) * BYTES_PER_BIT_IMAGE_ROW
      )
    );
  }
  expect(row(0)).toEqual([0x81, ...Array(BYTES_PER_BIT_IMAGE_ROW - 1).fill(0)]);
  expect(row(1)).toEqual([...Array(BYTES_PER_BIT_IMAGE_ROW - 1).fill(0), 0x01]);
  expect(row(2)).toEqual([
    0x00,
    0x80,
    0x80,
    ...Array(BYTES_PER_BIT_IMAGE_ROW - 3).fill(0),
  ]);
  expect(
    Array.from(
      imageDataToBitImage(imageData, 2, 3, { whiteThreshold: 100 }).data
    )
  ).toEqual([0x00, 0x80, ...Array(BYTES_PER_BIT_IMAGE_ROW - 2).fill(0)]);
});

test('imageDataToBitImage converts only the requested rows', () => {
  const imageData = whiteImage(LETTER_WIDTH_DOTS, 4);
  setPixel(imageData, TRIM_LEFT, 0, [0, 0, 0]);
  setPixel(imageData, TRIM_LEFT, 2, [0, 0, 0]);

  const bitImage = imageDataToBitImage(imageData, 1, 3);
  expect(bitImage.height).toEqual(2);
  expect(bitImage.data[0]).toEqual(0x00);
  expect(bitImage.data[BYTES_PER_BIT_IMAGE_ROW]).toEqual(0x80);

  expect(() => imageDataToBitImage(imageData, 3, 3)).toThrow(
    'Invalid row range'
  );
  expect(() => imageDataToBitImage(imageData, 0, 5)).toThrow(
    'Invalid row range'
  );
  expect(() => imageDataToBitImage(whiteImage(100, 4), 0, 4)).toThrow(
    'Image width must be 1700px'
  );
});

test('imageDataToBitImage matches a naive reference implementation', () => {
  const imageData = createImageData(LETTER_WIDTH_DOTS, 40);
  let seed = 12345;
  for (let i = 0; i < imageData.data.length; i += 1) {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    imageData.data[i] = i % 4 === 3 ? 255 : seed % 256;
  }

  const bitImage = imageDataToBitImage(imageData, 0, imageData.height);
  for (let y = 0; y < imageData.height; y += 1) {
    expect(
      Array.from(
        bitImage.data.subarray(
          y * BYTES_PER_BIT_IMAGE_ROW,
          (y + 1) * BYTES_PER_BIT_IMAGE_ROW
        )
      )
    ).toEqual(referenceBitImageRow(imageData, y));
  }
});

test('imageDataToBitImage with gamma conversion', () => {
  const imageData = whiteImage(LETTER_WIDTH_DOTS, 1);
  setPixel(imageData, TRIM_LEFT, 0, [0, 0, 0]);
  setPixel(imageData, TRIM_LEFT + 1, 0, [128, 128, 128]);

  const bitImage = imageDataToBitImage(imageData, 0, 1, {
    useGammaConversion: true,
  });
  expect(bitImage.data[0]).toEqual(0xc0);
  expect(Array.from(bitImage.data.subarray(1))).toEqual(
    Array(BYTES_PER_BIT_IMAGE_ROW - 1).fill(0)
  );
});

test('imageDataToBitImages splits the image into bands of at most 800 rows', () => {
  const imageData = whiteImage(LETTER_WIDTH_DOTS, 1700);
  setPixel(imageData, TRIM_LEFT, 799, [0, 0, 0]);
  setPixel(imageData, TRIM_LEFT, 800, [0, 0, 0]);
  setPixel(imageData, TRIM_LEFT, 1699, [0, 0, 0]);

  const bitImages = iter(imageDataToBitImages(imageData)).toArray();
  expect(bitImages.map((bitImage) => bitImage.height)).toEqual([800, 800, 100]);
  function lastRowFirstByte(data: Uint8Array): number | undefined {
    return data[data.length - BYTES_PER_BIT_IMAGE_ROW];
  }
  expect(lastRowFirstByte((bitImages[0] as { data: Uint8Array }).data)).toEqual(
    0x80
  );
  expect((bitImages[1] as { data: Uint8Array }).data[0]).toEqual(0x80);
  expect(lastRowFirstByte((bitImages[2] as { data: Uint8Array }).data)).toEqual(
    0x80
  );

  expect(
    iter(imageDataToBitImages(whiteImage(LETTER_WIDTH_DOTS, 800)))
      .map((bitImage) => bitImage.height)
      .toArray()
  ).toEqual([800]);
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
function mockDriver(
  statusOverrides: (
    replyParameter: number
  ) => Partial<RawPrinterStatus> = () => ({})
): Mocked<FujitsuThermalPrinterDriverInterface> {
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
    getStatus: vi.fn().mockImplementation(() =>
      Promise.resolve({
        ...idleRawStatus,
        ...statusOverrides(replyParameter),
        replyParameter,
      })
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
    expect(unpackBits(bitImage.data)).toHaveLength(
      bitImage.height * BYTES_PER_BIT_IMAGE_ROW
    );
    expect(unpackBits(bitImage.data).some((byte) => byte !== 0)).toEqual(true);
  }

  expect(driver.setReplyParameter.mock.calls.map(([p]) => p)).toEqual([
    PRINT_ONGOING_REPLY_PARAMETER,
    PRINT_PROCESSING_REPLY_PARAMETER,
    IDLE_REPLY_PARAMETER,
  ]);
  expect(driver.getStatus).toHaveBeenCalledTimes(bitImages.length + 1);
});

test('printPdf returns the printer status when the printer stops', async () => {
  const driver = mockDriver(() => ({ isPaperAtEnd: true }));
  const result = await printPdf(driver, readFileSync(singlePageReportPath));
  expect(result.err()).toEqual(expect.objectContaining({ isPaperAtEnd: true }));
  expect(driver.printBitImage).not.toHaveBeenCalled();
  expect(driver.setReplyParameter).toHaveBeenLastCalledWith(
    IDLE_REPLY_PARAMETER
  );
});

test('printPdf returns the printer status when the printer stops while flushing', async () => {
  const driver = mockDriver((replyParameter) =>
    replyParameter === PRINT_PROCESSING_REPLY_PARAMETER
      ? { isPaperAtEnd: true }
      : {}
  );
  const result = await printPdf(driver, readFileSync(singlePageReportPath));
  expect(result.err()).toEqual(expect.objectContaining({ isPaperAtEnd: true }));
  expect(driver.printBitImage).toHaveBeenCalledTimes(3);
  expect(driver.setReplyParameter).toHaveBeenLastCalledWith(
    IDLE_REPLY_PARAMETER
  );
});

test('printImageData pads narrower images to letter width', async () => {
  const imageData = whiteImage(100, 10);
  setPixel(imageData, TRIM_LEFT, 0, [0, 0, 0]);
  setPixel(imageData, 99, 9, [0, 0, 0]);

  const driver = mockDriver();
  const result = await printImageData(driver, imageData);
  expect(result).toEqual(ok());

  const [bitImage] = printedBitImages(driver);
  expect(bitImage?.height).toEqual(10);
  const unpacked = unpackBits(bitImage!.data);
  expect(unpacked).toHaveLength(10 * BYTES_PER_BIT_IMAGE_ROW);
  expect(unpacked[0]).toEqual(0x80);
  const lastRow = unpacked.subarray(9 * BYTES_PER_BIT_IMAGE_ROW);
  expect(lastRow[Math.floor((99 - TRIM_LEFT) / 8)]).toEqual(
    0x80 >> (99 - TRIM_LEFT) % 8
  );
  expect(lastRow.subarray(13).every((byte) => byte === 0)).toEqual(true);
  expect(driver.setReplyParameter).toHaveBeenLastCalledWith(
    IDLE_REPLY_PARAMETER
  );
});

test('printImageData passes letter-width images through unpadded', async () => {
  const driver = mockDriver();
  const result = await printImageData(driver, whiteImage(LETTER_WIDTH_DOTS, 5));
  expect(result).toEqual(ok());
  expect(printedBitImages(driver).map((bitImage) => bitImage.height)).toEqual([
    5,
  ]);
});
