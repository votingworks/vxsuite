import { IteratorPlus, Result, assert, iter, ok } from '@votingworks/basics';
import {
  createImageData,
  ImageData,
  pdfToImages,
} from '@votingworks/image-utils';
import { BITS_PER_BYTE } from '@votingworks/message-coder';
import { readFileSync } from 'node:fs';
import {
  FujitsuThermalPrinterDriver,
  FujitsuThermalPrinterDriverInterface,
} from './driver/driver.js';
import { CompressedBitImage, UncompressedBitImage } from './driver/types.js';
import { BitArray, bitArrayToByte } from './bits.js';
import { rootDebug } from './debug.js';
import { RawPrinterStatus } from './driver/index.js';
import {
  IDLE_REPLY_PARAMETER,
  PRINT_ONGOING_REPLY_PARAMETER,
  PRINT_PROCESSING_REPLY_PARAMETER,
} from './globals.js';
import { waitForPrintReadyStatus } from './status.js';

const debug = rootDebug.extend('printing');

// 1 byte = 1 millimeter
const BYTES_PER_BIT_IMAGE_ROW = 212;
const DRIVER_BIT_IMAGE_MAX_HEIGHT = 800;
/**
 * Width in dots of the printer's printable area. Image data printed via
 * {@link printImageData} must be exactly this wide.
 */
export const PAGE_DOTS_WIDTH = BYTES_PER_BIT_IMAGE_ROW * BITS_PER_BYTE;
const IMAGE_DATA_BYTES_PER_PIXEL = 4;
const LETTER_WIDTH_INCHES = 8.5;
const PRINTING_DPI = 200;

/**
 * Trims a page rendered at 8.5" wide (i.e. 1700px) to the printer's printable
 * width, centering the printable area.
 */
export function trimImageDataToPageWidth(imageData: ImageData): ImageData {
  assert(imageData.width === LETTER_WIDTH_INCHES * PRINTING_DPI);
  debug('trimming image data to page width');

  const trimLeft = (imageData.width - PAGE_DOTS_WIDTH) / 2;
  const trimmedImageData = createImageData(PAGE_DOTS_WIDTH, imageData.height);

  for (let y = 0; y < imageData.height; y += 1) {
    const pixelStart = y * imageData.width + trimLeft;
    const pixelEnd = pixelStart + PAGE_DOTS_WIDTH;
    trimmedImageData.data.set(
      imageData.data.subarray(
        pixelStart * IMAGE_DATA_BYTES_PER_PIXEL,
        pixelEnd * IMAGE_DATA_BYTES_PER_PIXEL
      ),
      y * PAGE_DOTS_WIDTH * IMAGE_DATA_BYTES_PER_PIXEL
    );
  }

  return trimmedImageData;
}

/**
 * Splits page-width image data into chunks the driver can accept.
 */
export function* chunkImageData(imageData: ImageData): Generator<ImageData> {
  assert(imageData.width === PAGE_DOTS_WIDTH);

  const bytesPerRow = PAGE_DOTS_WIDTH * IMAGE_DATA_BYTES_PER_PIXEL;
  let chunkStartY = 0;
  while (chunkStartY < imageData.height) {
    debug(`chunking image data at y=${chunkStartY}`);
    const chunkEndY = Math.min(
      imageData.height,
      chunkStartY + DRIVER_BIT_IMAGE_MAX_HEIGHT
    );

    yield createImageData(
      imageData.data.subarray(
        chunkStartY * bytesPerRow,
        chunkEndY * bytesPerRow
      ),
      PAGE_DOTS_WIDTH,
      chunkEndY - chunkStartY
    );

    chunkStartY = chunkEndY;
  }
}

export interface BinaryBitmap {
  width: number;
  height: number;
  data: boolean[];
}

/**
 * Converts 8-bit sRGB color values to an 8-bit grayscale value without gamma
 * correction.
 *
 * @param r Red color value from 0 - 255
 * @param g Green color value from 0 - 255
 * @param b Blue color value from 0 - 255
 * @returns Grayscale color value from 0 - 255
 */
// @coverage-defer
export function rgbToGrayscale(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Below this value, we consider the grayscale to be black. Otherwise, white.
 */
const GRAYSCALE_WHITE_THRESHOLD = 230;

/**
 * Converts 8-bit sRGB color values to a binary black/white representation.
 * Uses weighted method without gamma correction for speed.
 *
 * @param r Red color value from 0 - 255
 * @param g Green color value from 0 - 255
 * @param b Blue color value from 0 - 255
 * @returns true for black, false for white
 */
// @coverage-defer
function rgbToBinary(r: number, g: number, b: number): boolean {
  return rgbToGrayscale(r, g, b) < GRAYSCALE_WHITE_THRESHOLD;
}

// @coverage-defer
export function imageDataToBinaryBitmap(imageData: ImageData): BinaryBitmap {
  debug('converting image data to binary bitmap');

  const data: boolean[] = [];

  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i] as number;
    const g = imageData.data[i + 1] as number;
    const b = imageData.data[i + 2] as number;

    data.push(rgbToBinary(r, g, b));
  }

  return {
    data,
    width: imageData.width,
    height: imageData.height,
  };
}

// @coverage-defer
function bitmapToBitImage(bitmap: BinaryBitmap): UncompressedBitImage {
  debug('converting bitmap to bit image');
  const byteMap: number[] = [];

  for (let i = 0; i < bitmap.data.length; i += 8) {
    byteMap.push(bitArrayToByte(bitmap.data.slice(i, i + 8) as BitArray));
  }

  return {
    height: bitmap.height,
    data: new Uint8Array(byteMap),
    compressed: false,
  };
}

const MAX_PACKET_DATA_LENGTH = 128;

/**
 * Compresses the bit image according to the PackBits algorithm that the device uses.
 */
export function packBitsCompression(data: Uint8Array): Int8Array {
  const compressedData: number[] = [];

  let i = 0;
  let literalBuffer: number[] = [];

  function flushLiteralBuffer() {
    if (literalBuffer.length === 0) return;

    compressedData.push(literalBuffer.length - 1, ...literalBuffer);
    literalBuffer = [];
  }

  while (i < data.length) {
    const byte = data[i] as number;
    // if a lone final byte, encode as literal
    if (i + 1 >= data.length) {
      literalBuffer.push(byte);
      flushLiteralBuffer();
      break;
    }

    const nextByte = data[i + 1] as number;

    if (byte === nextByte) {
      flushLiteralBuffer();

      // encode repeating bytes
      let repeats = 2;
      while (
        i + repeats < data.length &&
        repeats < MAX_PACKET_DATA_LENGTH &&
        data[i + repeats] === byte
      ) {
        repeats += 1;
      }
      compressedData.push(1 - repeats, byte);
      i += repeats;
    } else {
      literalBuffer.push(byte);
      // @coverage-defer
      if (literalBuffer.length === MAX_PACKET_DATA_LENGTH) {
        flushLiteralBuffer();
      }
      i += 1;
    }
  }

  flushLiteralBuffer();

  return new Int8Array(compressedData);
}

export function compressBitImage(
  uncompressed: UncompressedBitImage
): CompressedBitImage {
  debug('compressing bit image');
  return {
    height: uncompressed.height,
    data: packBitsCompression(uncompressed.data),
    compressed: true,
  };
}

const WAIT_FOR_BUFFER_NOT_FULL_TIMEOUT_MS = 2.5 * 1000;
const WAIT_FOR_BUFFER_FLUSH_TIMEOUT_MS = 10 * 1000;

// @coverage-defer
export async function printPageBitImage(
  driver: FujitsuThermalPrinterDriverInterface,
  compressedBitImages: IteratorPlus<CompressedBitImage>
): Promise<Result<void, RawPrinterStatus>> {
  // print all bit images that compose the page
  await driver.setReplyParameter(PRINT_ONGOING_REPLY_PARAMETER);
  for (const compressedBitImage of compressedBitImages) {
    // wait for the buffer to be ready before sending another bit image. this
    // is not strictly necessary - either the OS or `node-usb` layer handles
    // buffering - but it allows us to keep our execution roughly in sync with
    // the hardware and allows us to bail earlier if the printer stops
    const waitForPrintReadyResult = await waitForPrintReadyStatus(driver, {
      interval: 100,
      timeout: WAIT_FOR_BUFFER_NOT_FULL_TIMEOUT_MS,
      replyParameter: PRINT_ONGOING_REPLY_PARAMETER,
    });
    if (waitForPrintReadyResult.isErr()) {
      return waitForPrintReadyResult;
    }

    assert(compressedBitImage);
    driver.printBitImage(compressedBitImage);
  }

  await driver.setReplyParameter(PRINT_PROCESSING_REPLY_PARAMETER);
  const waitForPrintFinished = await waitForPrintReadyStatus(driver, {
    interval: 100,
    timeout: WAIT_FOR_BUFFER_FLUSH_TIMEOUT_MS,
    replyParameter: PRINT_PROCESSING_REPLY_PARAMETER,
  });
  if (waitForPrintFinished.isErr()) {
    return waitForPrintFinished;
  }

  debug('printed page successfully');
  return ok();
}

/**
 * Prints page-width image data ({@link PAGE_DOTS_WIDTH}).
 */
// @coverage-defer
async function printImageDataInternal(
  driver: FujitsuThermalPrinterDriverInterface,
  imageData: ImageData
): Promise<Result<void, RawPrinterStatus>> {
  return await printPageBitImage(
    driver,
    iter(chunkImageData(imageData))
      .map((chunk) => imageDataToBinaryBitmap(chunk))
      .map(bitmapToBitImage)
      .map(compressBitImage)
  );
}

/**
 * Prints an image that is exactly {@link PAGE_DOTS_WIDTH} dots wide.
 */
// @coverage-defer
export async function printImageData(
  driver: FujitsuThermalPrinterDriverInterface,
  imageData: ImageData
): Promise<Result<void, RawPrinterStatus>> {
  assert(
    imageData.width === PAGE_DOTS_WIDTH,
    `Image width must be ${PAGE_DOTS_WIDTH}, got ${imageData.width}`
  );

  debug(
    `printing image with dimensions: ${imageData.width} x ${imageData.height}`
  );
  const printPageResult = await printImageDataInternal(driver, imageData);
  await driver.setReplyParameter(IDLE_REPLY_PARAMETER);
  return printPageResult;
}

/**
 * The PDF data is at a standard 72 DPI, which we scale up for 200 DPI printer.
 */
const PDF_SCALE = 200 / 72;

// @coverage-defer
export async function printPdf(
  driver: FujitsuThermalPrinterDriverInterface,
  pdfData: Uint8Array
): Promise<Result<void, RawPrinterStatus>> {
  const pdfImages = pdfToImages(pdfData, { scale: PDF_SCALE });
  for await (const { page, pageNumber, pageCount } of pdfImages) {
    debug(`printing page ${pageNumber} of ${pageCount}...`);
    debug(`page dimensions: ${page.width} x ${page.height}`);
    const printPageResult = await printImageDataInternal(
      driver,
      trimImageDataToPageWidth(page)
    );
    if (printPageResult.isErr()) {
      await driver.setReplyParameter(IDLE_REPLY_PARAMETER);
      return printPageResult;
    }
  }

  await driver.setReplyParameter(IDLE_REPLY_PARAMETER);
  return ok();
}

// @coverage-defer
export async function printFixture(
  pdfFixturePath: string,
  driver: FujitsuThermalPrinterDriver
): Promise<void> {
  const pdfData = readFileSync(pdfFixturePath);
  const printResult = await printPdf(driver, pdfData);
  if (printResult.isErr()) {
    debug(`print failed on status: ${JSON.stringify(printResult.err())}`);
  }
}
