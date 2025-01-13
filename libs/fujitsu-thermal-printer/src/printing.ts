import { IteratorPlus, Result, assert, iter, ok } from '@votingworks/basics';
import { ImageData, pdfToImages } from '@votingworks/image-utils';
import { BITS_PER_BYTE } from '@votingworks/message-coder';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import {
  FujitsuThermalPrinterDriver,
  FujitsuThermalPrinterDriverInterface,
} from './driver/driver';
import { CompressedBitImage, UncompressedBitImage } from './driver/types';
import { BitArray, bitArrayToByte } from './bits';
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

function* trimAndChunkImageData(imageData: ImageData): Generator<ImageData> {
  assert(imageData.width === LETTER_WIDTH_INCHES * PRINTING_DPI);

  const trimLeft = (imageData.width - PAGE_DOTS_WIDTH) / 2;

  let chunkStartY = 0;
  while (chunkStartY < imageData.height) {
    debug(`trimming and chunking image data at y=${chunkStartY}`);
    const trimmedData: number[] = [];
    const chunkEndY = Math.min(
      imageData.height,
      chunkStartY + DRIVER_BIT_IMAGE_MAX_HEIGHT
    );

    for (let y = chunkStartY; y < chunkEndY; y += 1) {
      const pixelStart = y * imageData.width + trimLeft;
      const pixelEnd = pixelStart + PAGE_DOTS_WIDTH;
      trimmedData.push(
        ...imageData.data.slice(
          pixelStart * IMAGE_DATA_BYTES_PER_PIXEL,
          pixelEnd * IMAGE_DATA_BYTES_PER_PIXEL
        )
      );
    }

    yield {
      ...imageData,
      height: chunkEndY - chunkStartY,
      width: PAGE_DOTS_WIDTH,
      data: new Uint8ClampedArray(trimmedData),
    };

    chunkStartY += DRIVER_BIT_IMAGE_MAX_HEIGHT;
  }
}

export interface BinaryBitmap {
  width: number;
  height: number;
  data: boolean[];
}

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
 * Converts 8-bit sRGB color values to a binary black/white representation.
 * Uses weighted method without gamma correction for speed.
 *
 * @param r Red color value from 0 - 255
 * @param g Green color value from 0 - 255
 * @param b Blue color value from 0 - 255
 * @returns true for black, false for white
 */
function rgbToBinary(
  r: number,
  g: number,
  b: number,
  options: ImageConversionOptions
): boolean {
  const grayscaleValue = (
    options.useGammaConversion ? rgbToGrayscaleGamma : rgbToGrayscale
  )(r, g, b);
  return grayscaleValue < options.whiteThreshold;
}

export function imageDataToBinaryBitmap(
  imageData: ImageData,
  overrideOptions: Partial<ImageConversionOptions> = {}
): BinaryBitmap {
  debug('converting image data to binary bitmap');
  const options: ImageConversionOptions = {
    ...DEFAULT_IMAGE_CONVERSION_OPTIONS,
    ...overrideOptions,
  };

  const data: boolean[] = [];

  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i] as number;
    const g = imageData.data[i + 1] as number;
    const b = imageData.data[i + 2] as number;

    data.push(rgbToBinary(r, g, b, options));
  }

  return {
    data,
    width: imageData.width,
    height: imageData.height,
  };
}

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
 * The PDF data is at a standard 72 DPI, which we scale up for 200 DPI printer.
 */
const PDF_SCALE = 200 / 72;

export async function print(
  driver: FujitsuThermalPrinterDriverInterface,
  pdfData: Uint8Array
): Promise<Result<void, RawPrinterStatus>> {
  const pdfImages = pdfToImages(Buffer.from(pdfData), {
    scale: PDF_SCALE,
  });
  for await (const { page, pageNumber, pageCount } of pdfImages) {
    debug(`printing page ${pageNumber} of ${pageCount}...`);
    debug(`page dimensions: ${page.width} x ${page.height}`);
    const printPageResult = await printPageBitImage(
      driver,
      iter(trimAndChunkImageData(page))
        .map((imageData) => imageDataToBinaryBitmap(imageData, {}))
        .map(bitmapToBitImage)
        .map(compressBitImage)
    );
    if (printPageResult.isErr()) {
      await driver.setReplyParameter(IDLE_REPLY_PARAMETER);
      return printPageResult;
    }
  }

  await driver.setReplyParameter(IDLE_REPLY_PARAMETER);
  return ok();
}

export async function printFixture(
  pdfFixturePath: string,
  driver: FujitsuThermalPrinterDriver
): Promise<void> {
  const pdfData: Uint8Array = readFileSync(pdfFixturePath);
  const printResult = await print(driver, pdfData);
  if (printResult.isErr()) {
    debug(`print failed on status: ${JSON.stringify(printResult.err())}`);
  }
}
