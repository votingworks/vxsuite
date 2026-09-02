import { IteratorPlus, Result, assert, iter, ok } from '@votingworks/basics';
import {
  createImageData,
  getImageChannelCount,
  ImageData,
  pdfToImages,
} from '@votingworks/image-utils';
import { BITS_PER_BYTE } from '@votingworks/message-coder';
import { readFileSync } from 'node:fs';
import {
  FujitsuThermalPrinterDriver,
  FujitsuThermalPrinterDriverInterface,
} from './driver/driver';
import { CompressedBitImage, UncompressedBitImage } from './driver/types';
import { rootDebug } from './debug';
import { RawPrinterStatus } from './driver';
import {
  IDLE_REPLY_PARAMETER,
  PRINT_ONGOING_REPLY_PARAMETER,
  PRINT_PROCESSING_REPLY_PARAMETER,
} from './globals';
import { waitForPrintReadyStatus } from './status';

const debug = rootDebug.extend('printing');

// 1 byte = 1 millimeter
const BYTES_PER_BIT_IMAGE_ROW = 212;
const DRIVER_BIT_IMAGE_MAX_HEIGHT = 800;
const PAGE_DOTS_WIDTH = BYTES_PER_BIT_IMAGE_ROW * BITS_PER_BYTE;
const IMAGE_DATA_BYTES_PER_PIXEL = 4;
const LETTER_WIDTH_INCHES = 8.5;
const PRINTING_DPI = 200;
const LETTER_WIDTH_DOTS = LETTER_WIDTH_INCHES * PRINTING_DPI;

// Grayscale conversion algorithm used is from
// https://en.wikipedia.org/wiki/Grayscale#Colorimetric_(perceptual_luminance-preserving)_conversion_to_grayscale

/**
 *
 * @param x Gamma-compressed color value
 * @returns
 */
function gammaExpand(x: number) {
  if (x < 0.04045) {
    return x / 12.92;
  }

  return ((x + 0.055) / 1.055) ** 2.4;
}

function gammaCompress(x: number) {
  if (x < 0.0031308) {
    return x * 12.92;
  }

  return 1.055 * x ** (1 / 1.24) - 0.055;
}

/**
 * Converts 8-bit sRGB color values to an 8-bit grayscale value with gamma
 * correction.
 *
 * @param r Red color value from 0 - 255
 * @param g Green color value from 0 - 255
 * @param b Blue color value from 0 - 255
 * @returns Grayscale color value from 0 - 255
 */
export function rgbToGrayscaleGamma(r: number, g: number, b: number): number {
  return (
    gammaCompress(
      0.2126 * gammaExpand(r / 256) +
        0.7152 * gammaExpand(g / 256) +
        0.0722 * gammaExpand(b / 256)
    ) * 256
  );
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
export function rgbToGrayscale(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Below this value, we consider the grayscale to be black. Otherwise, white.
 */
const DEFAULT_GRAYSCALE_WHITE_THRESHOLD = 230;

export interface ImageConversionOptions {
  useGammaConversion: boolean;
  // number in [0, 256), above which the grayscale will be considered white
  whiteThreshold: number;
}

export const DEFAULT_IMAGE_CONVERSION_OPTIONS: ImageConversionOptions = {
  useGammaConversion: false,
  whiteThreshold: DEFAULT_GRAYSCALE_WHITE_THRESHOLD,
};

/**
 * Converts rows `[startY, endY)` of a letter-width (1700px) image into a bit
 * image, trimmed to the printable width. MSB is the leftmost dot, 1 = black.
 * Runs between USB writes while printing, so it makes a single pass over the
 * pixels with no per-pixel allocation.
 */
export function imageDataToBitImage(
  imageData: ImageData,
  startY: number,
  endY: number,
  overrideOptions: Partial<ImageConversionOptions> = {}
): UncompressedBitImage {
  assert(
    imageData.width === LETTER_WIDTH_DOTS,
    `Image width must be ${LETTER_WIDTH_DOTS}px, got ${imageData.width}px`
  );
  assert(
    startY >= 0 && startY < endY && endY <= imageData.height,
    `Invalid row range [${startY}, ${endY}) for image of height ${imageData.height}`
  );

  const { useGammaConversion, whiteThreshold }: ImageConversionOptions = {
    ...DEFAULT_IMAGE_CONVERSION_OPTIONS,
    ...overrideOptions,
  };
  const rgbToGray = useGammaConversion ? rgbToGrayscaleGamma : rgbToGrayscale;
  const { width, data } = imageData;
  const trimLeft = (width - PAGE_DOTS_WIDTH) / 2;
  const height = endY - startY;
  const bytes = new Uint8Array(height * BYTES_PER_BIT_IMAGE_ROW);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * BYTES_PER_BIT_IMAGE_ROW;
    let offset = ((startY + y) * width + trimLeft) * IMAGE_DATA_BYTES_PER_PIXEL;

    for (
      let byteIndex = 0;
      byteIndex < BYTES_PER_BIT_IMAGE_ROW;
      byteIndex += 1
    ) {
      let byte = 0;
      for (let bit = 0; bit < BITS_PER_BYTE; bit += 1) {
        byte <<= 1;
        const isBlack =
          rgbToGray(
            data[offset] as number,
            data[offset + 1] as number,
            data[offset + 2] as number
          ) < whiteThreshold;
        if (isBlack) {
          byte |= 1;
        }
        offset += IMAGE_DATA_BYTES_PER_PIXEL;
      }
      bytes[rowStart + byteIndex] = byte;
    }
  }

  return { height, data: bytes, compressed: false };
}

/**
 * Lazily converts a letter-width (1700px) image into bit images no taller than
 * the driver maximum.
 */
export function* imageDataToBitImages(
  imageData: ImageData,
  overrideOptions: Partial<ImageConversionOptions> = {}
): Generator<UncompressedBitImage> {
  for (
    let startY = 0;
    startY < imageData.height;
    startY += DRIVER_BIT_IMAGE_MAX_HEIGHT
  ) {
    const endY = Math.min(
      imageData.height,
      startY + DRIVER_BIT_IMAGE_MAX_HEIGHT
    );
    debug(`converting image rows [${startY}, ${endY}) to bit image`);
    yield imageDataToBitImage(imageData, startY, endY, overrideOptions);
  }
}

const MAX_PACKET_DATA_LENGTH = 128;

/**
 * Compresses the bit image according to the PackBits algorithm that the device uses.
 */
export function packBitsCompression(data: Uint8Array): Int8Array {
  // PackBits expands at most 4:3 (1-byte literal then 2-byte run, repeated)
  const compressed = new Int8Array(data.length * 2);
  let compressedLength = 0;

  let literalStart = 0;
  let literalLength = 0;

  function flushLiteralBuffer() {
    if (literalLength === 0) return;

    compressed[compressedLength] = literalLength - 1;
    compressed.set(
      data.subarray(literalStart, literalStart + literalLength),
      compressedLength + 1
    );
    compressedLength += literalLength + 1;
    literalLength = 0;
  }

  function pushLiteral(index: number) {
    if (literalLength === 0) {
      literalStart = index;
    }
    literalLength += 1;
  }

  let i = 0;
  while (i < data.length) {
    const byte = data[i] as number;
    // if a lone final byte, encode as literal
    if (i + 1 >= data.length) {
      pushLiteral(i);
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
      compressed[compressedLength] = 1 - repeats;
      compressed[compressedLength + 1] = byte;
      compressedLength += 2;
      i += repeats;
    } else {
      pushLiteral(i);
      if (literalLength === MAX_PACKET_DATA_LENGTH) {
        flushLiteralBuffer();
      }
      i += 1;
    }
  }

  flushLiteralBuffer();

  return compressed.slice(0, compressedLength);
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

    await driver.printBitImage(compressedBitImage);
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
 * Prints an image assuming it is 8.5" wide (i.e. 1700px).
 */
async function printImageDataInternal(
  driver: FujitsuThermalPrinterDriverInterface,
  imageData: ImageData
): Promise<Result<void, RawPrinterStatus>> {
  return await printPageBitImage(
    driver,
    iter(imageDataToBitImages(imageData)).map(compressBitImage)
  );
}

/**
 * Prints an image assuming it is less than or equal to 8.5" wide (i.e. 1700px).
 */
export async function printImageData(
  driver: FujitsuThermalPrinterDriverInterface,
  imageData: ImageData
): Promise<Result<void, RawPrinterStatus>> {
  assert(
    imageData.width <= LETTER_WIDTH_DOTS,
    `Image width exceeds maximum allowed: ${imageData.width} > ${LETTER_WIDTH_DOTS}`
  );

  let paddedImageData: ImageData;
  if (imageData.width === LETTER_WIDTH_DOTS) {
    paddedImageData = imageData;
  } else {
    paddedImageData = createImageData(LETTER_WIDTH_DOTS, imageData.height);

    // fill with white
    paddedImageData.data.fill(255);

    // copy the image data one row at a time
    const channelCount = getImageChannelCount(paddedImageData);
    let src = 0;
    let dst = 0;
    for (let y = 0; y < imageData.height; y += 1) {
      paddedImageData.data.set(
        imageData.data.subarray(src, src + imageData.width * channelCount),
        dst
      );
      src += imageData.width * channelCount;
      dst += paddedImageData.width * channelCount;
    }
  }

  debug(
    `printing image with dimensions: ${imageData.width} x ${imageData.height}`
  );
  const printPageResult = await printImageDataInternal(driver, paddedImageData);
  await driver.setReplyParameter(IDLE_REPLY_PARAMETER);
  return printPageResult;
}

/**
 * The PDF data is at a standard 72 DPI, which we scale up for 200 DPI printer.
 */
const PDF_SCALE = 200 / 72;

export async function printPdf(
  driver: FujitsuThermalPrinterDriverInterface,
  pdfData: Uint8Array
): Promise<Result<void, RawPrinterStatus>> {
  const pdfImages = pdfToImages(pdfData, { scale: PDF_SCALE });
  for await (const { page, pageNumber, pageCount } of pdfImages) {
    debug(`printing page ${pageNumber} of ${pageCount}...`);
    debug(`page dimensions: ${page.width} x ${page.height}`);
    const printPageResult = await printImageDataInternal(driver, page);
    if (printPageResult.isErr()) {
      await driver.setReplyParameter(IDLE_REPLY_PARAMETER);
      return printPageResult;
    }
  }

  await driver.setReplyParameter(IDLE_REPLY_PARAMETER);
  return ok();
}

// @coverage-defer: dev-only CLI helper
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
