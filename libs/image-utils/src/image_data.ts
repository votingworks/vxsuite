import {
  assert,
  err,
  extractErrorMessage,
  ok,
  Result,
} from '@votingworks/basics';
import { GrayImageData, RgbaImageData } from '@votingworks/types';
import { time } from '@votingworks/utils';
import { Buffer } from 'node:buffer';
import * as canvas from 'canvas';
import makeDebug from 'debug';
import { open, writeFile } from 'node:fs/promises';

import { assertInteger } from './numeric';
import { int, u8, usize } from './types';

const debug = makeDebug('image-utils');

/**
 * The number of channels an RGBA color image has (4).
 */
export const RGBA_CHANNEL_COUNT = 4;

/**
 * Summarize pixel buffers rather than serializing them.
 */
function withCompactJson<T extends canvas.ImageData>(image: T): T {
  return Object.defineProperty(image, 'toJSON', {
    value: () => `[ImageData ${image.width}x${image.height}]`,
  });
}

/**
 * Allocates RGBA pixel data of the given dimensions.
 */
export function createImageData(width: number, height: number): RgbaImageData;

/**
 * Wraps existing RGBA pixel data of the givevn dimensions.
 */
export function createImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number
): RgbaImageData;

/**
 * Creates RGBA (four bytes per pixel) image data.
 */
export function createImageData(
  widthOrData: number | Uint8ClampedArray,
  heightOrWidth: number,
  undefinedOrHeight?: number
): RgbaImageData {
  if (
    typeof widthOrData === 'number' &&
    typeof undefinedOrHeight === 'undefined'
  ) {
    const width = widthOrData;
    const height = heightOrWidth;
    return withCompactJson(
      canvas.createImageData(width, height)
    ) as RgbaImageData;
  }

  if (
    typeof widthOrData === 'object' &&
    typeof undefinedOrHeight === 'number'
  ) {
    const data = widthOrData;
    const width = heightOrWidth;
    const height = undefinedOrHeight;
    assert(data.length === width * height * RGBA_CHANNEL_COUNT);
    return withCompactJson(
      canvas.createImageData(data, width, height)
    ) as RgbaImageData;
  }

  // @coverage-exclude
  throw new Error('unexpected arguments');
}

/**
 * Allocates grayscale pixel data of the given dimensions.
 */
export function createGrayImageData(
  width: number,
  height: number
): GrayImageData;

/**
 * Wraps existing grayscale pixel data of the given dimensions.
 */
export function createGrayImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number
): GrayImageData;

/**
 * Creates grayscale image data.
 */
export function createGrayImageData(
  widthOrData: number | Uint8ClampedArray,
  heightOrWidth: number,
  undefinedOrHeight?: number
): GrayImageData {
  if (
    typeof widthOrData === 'number' &&
    typeof undefinedOrHeight === 'undefined'
  ) {
    const width = widthOrData;
    const height = heightOrWidth;
    return withCompactJson(
      canvas.createImageData(
        new Uint8ClampedArray(width * height),
        width,
        height
      )
    ) as GrayImageData;
  }

  if (
    typeof widthOrData === 'object' &&
    typeof undefinedOrHeight === 'number'
  ) {
    const data = widthOrData;
    const width = heightOrWidth;
    const height = undefinedOrHeight;
    assert(data.length === width * height);
    return withCompactJson(
      canvas.createImageData(data, width, height)
    ) as GrayImageData;
  }

  // @coverage-exclude
  throw new Error('unexpected arguments');
}

/**
 * Ensures the image data is an instance of ImageData.
 */
export function ensureImageData(imageData: canvas.ImageData): canvas.ImageData {
  if (imageData instanceof canvas.ImageData) {
    return imageData;
  }

  const { data, width, height } = imageData;
  return canvas.createImageData(data, width, height);
}

/**
 * Determines the number of channels in an image.
 */
export function getImageChannelCount(image: canvas.ImageData): int {
  return assertInteger(image.data.length / image.width / image.height);
}

/**
 * Determines whether the image is RGBA.
 */
export function isRgba(image: canvas.ImageData): image is RgbaImageData {
  return getImageChannelCount(image) === RGBA_CHANNEL_COUNT;
}

/**
 * Loads an image from a file path or buffer.
 */
export async function loadImageData(
  pathOrData: string | Buffer
): Promise<
  Result<RgbaImageData, { type: 'invalid-image-file'; message: string }>
> {
  let image: canvas.Image;
  try {
    image = await canvas.loadImage(pathOrData);
  } catch (error) {
    // canvasLoadImage will fail on a corrupted image or a file that isn't an image
    return err({
      type: 'invalid-image-file',
      message: extractErrorMessage(error),
    });
  }
  const cvs = canvas.createCanvas(image.width, image.height);
  const ctx = cvs.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(
    0,
    0,
    image.width,
    image.height
  ) as RgbaImageData;
  return ok(imageData);
}

// Read enough bytes to find the JPEG SOF marker, which appears after
// quantization tables and typically falls within the first few kilobytes.
// 24 bytes suffices for PNG (8-byte signature + 8-byte IHDR header + 8-byte dims).
//
// While valid JPEGs might have enough data in the file before the SOF marker
// to push the first SOF marker beyond 4096 bytes, these are unlikely to be
// encountered with the files VxSuite works with. Examples of such files include
// JPEGs with:
// - Huge EXIF blocks (camera metadata - GPS, lens info, exposure, etc.)
// - ICC color profiles (color management for print/photo workflows)
// - Embedded thumbnails (camera preview images)
const MAX_HEADER_BYTES_FROM_FILE = 4096;

// 0x89 'P' 'N' 'G' '\r' '\n' 0x1A '\n'
const PNG_SIGNATURE = Buffer.of(137, 80, 78, 71, 13, 10, 26, 10);

/**
 * Reads PNG image dimensions from the IHDR chunk. Returns undefined if the
 * buffer does not start with a valid PNG signature.
 *
 * @see https://github.com/corkami/formats/blob/master/image/png.md
 */
function findPngDimensions(
  data: Buffer
): { width: number; height: number } | undefined {
  // PNG header: 8-byte signature + 4-byte chunk length + 4-byte "IHDR" type
  // + 4-byte width + 4-byte height = 24 bytes minimum
  if (data.length < 24) return undefined;
  if (
    data.compare(
      PNG_SIGNATURE,
      0,
      PNG_SIGNATURE.length,
      0,
      PNG_SIGNATURE.length
    ) !== 0
  ) {
    return undefined;
  }
  if (data.toString('ascii', 12, 16) !== 'IHDR') {
    return undefined;
  }
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

/**
 * Scans a buffer for a JPEG SOF (Start of Frame) marker and extracts image
 * dimensions. Returns undefined if the buffer does not start with a valid JPEG
 * SOI marker or if no SOF marker is found within the buffer.
 *
 * This is not designed to work with all JPEG files, but rather with those
 * typically processed by VxSuite. It may not handle files produced by some
 * digital cameras, for example. It also will not handle some other JPEG formats
 * like JPEG2000 or JPEG XL, which are not supported by VxSuite.
 *
 * @see https://github.com/corkami/formats/blob/master/image/jpeg.md
 */
function findJpegDimensions(
  data: Buffer
): { width: number; height: number } | undefined {
  // require that the buffer starts with a valid JPEG SOI marker
  if (data.length < 2 || data[0] !== 0xff || data[1] !== 0xd8) {
    return undefined;
  }

  // process segments until we find a SOF marker which contains image dimensions
  let offset = 2;
  while (offset + 1 < data.length) {
    // skip padding bytes
    while (offset < data.length && data[offset] !== 0xff) offset += 1;
    while (offset < data.length && data[offset] === 0xff) offset += 1;
    const marker = data[offset] as number;
    offset += 1;

    // Markers without a payload: SOI (D8), EOI (D9), RST0-RST7 (D0-D7)
    if (marker >= 0xd0 && marker <= 0xd9) {
      continue;
    }

    if (offset + 2 > data.length) break;
    const segmentLength = data.readUInt16BE(offset);

    if (segmentLength < 2) return undefined;

    // SOF markers contain image dimensions.
    // C0-C3, C5-C7, C9-CB, CD-CF are SOF; C4=DHT, C8=JPG, CC=DAC are not.
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      // SOF payload: length (2) + precision (1) + height (2) + width (2)
      if (offset + 7 > data.length) break;
      const height = data.readUInt16BE(offset + 3);
      const width = data.readUInt16BE(offset + 5);
      return { width, height };
    }

    offset += segmentLength;
  }

  return undefined;
}

/**
 * Loads image metadata from a file or buffer without decoding the image data.
 * If all you need is the image dimensions, this is much faster than
 * `loadImageData`.
 */
export async function loadImageMetadata(
  pathOrData: string | Buffer
): Promise<
  Result<
    { type: 'image/jpeg' | 'image/png'; width: number; height: number },
    { type: 'invalid-image-file'; message: string }
  >
> {
  let headerBytes: Buffer;
  try {
    if (typeof pathOrData === 'string') {
      const file = await open(pathOrData, 'r');
      try {
        headerBytes = Buffer.alloc(MAX_HEADER_BYTES_FROM_FILE);
        await file.read(headerBytes, 0, headerBytes.byteLength);
      } finally {
        await file.close();
      }
    } else {
      headerBytes = pathOrData;
    }
  } catch (error) {
    return err({
      type: 'invalid-image-file',
      message: extractErrorMessage(error),
    });
  }

  const pngDimensions = findPngDimensions(headerBytes);
  if (pngDimensions) {
    return ok({ type: 'image/png', ...pngDimensions });
  }

  const jpegDimensions = findJpegDimensions(headerBytes);
  if (jpegDimensions) {
    return ok({ type: 'image/jpeg', ...jpegDimensions });
  }

  return err({
    type: 'invalid-image-file',
    message: 'File is not PNG or JPEG',
  });
}

/**
 * Creates an image data from grayscale pixels.
 */
export function fromGrayScale(
  pixels: ArrayLike<u8>,
  width: usize,
  height: usize
): RgbaImageData {
  assert(width > 0 && Number.isInteger(width), 'Invalid width');
  assert(height > 0 && Number.isInteger(height), 'Invalid height');
  assert(pixels.length === width * height, 'Invalid pixel count');

  const imageDataBuffer = new Uint8ClampedArray(
    width * height * RGBA_CHANNEL_COUNT
  );

  // fill the buffer with 0xff to make it opaque
  imageDataBuffer.fill(0xff);

  for (
    let grayIndex = 0, rgbaIndex = 0;
    grayIndex < pixels.length;
    grayIndex += 1, rgbaIndex += RGBA_CHANNEL_COUNT
  ) {
    const gray = pixels[grayIndex] as u8;
    imageDataBuffer[rgbaIndex] = gray;
    imageDataBuffer[rgbaIndex + 1] = gray;
    imageDataBuffer[rgbaIndex + 2] = gray;
  }

  return createImageData(imageDataBuffer, width, height);
}

/**
 * Converts 8-bit sRGB color values to an 8-bit grayscale value.
 */
export function rgbToGrayscale(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Converts RGBA pixel data to a grayscale image. Ignores the alpha channel.
 */
export function toGrayScale(
  pixels: ArrayLike<u8>,
  width: usize,
  height: usize
): GrayImageData {
  assert(width > 0 && Number.isInteger(width), 'Invalid width');
  assert(height > 0 && Number.isInteger(height), 'Invalid height');
  assert(
    pixels.length === width * height * RGBA_CHANNEL_COUNT,
    'Invalid pixel count'
  );

  const imageData = createGrayImageData(width, height);
  const dstData = imageData.data;

  for (
    let srcOffset = 0, dstOffset = 0;
    srcOffset < pixels.length;
    srcOffset += RGBA_CHANNEL_COUNT, dstOffset += 1
  ) {
    dstData[dstOffset] = rgbToGrayscale(
      pixels[srcOffset] as number,
      pixels[srcOffset + 1] as number,
      pixels[srcOffset + 2] as number
    );
  }

  return imageData;
}

function createCanvasWithImageData(imageData: canvas.ImageData) {
  assert(
    isRgba(imageData),
    `Expected RGBA image data, got ${getImageChannelCount(
      imageData
    )} channel(s)`
  );
  const cvs = canvas.createCanvas(imageData.width, imageData.height);
  const ctx = cvs.getContext('2d');
  ctx.putImageData(ensureImageData(imageData), 0, 0);
  return cvs;
}

/**
 * Creates a data URL from image data.
 */
export function toDataUrl(
  image: canvas.ImageData,
  mimeType: 'image/png' | 'image/jpeg'
): string {
  const cvs = createCanvasWithImageData(image);
  return mimeType === 'image/jpeg'
    ? cvs.toDataURL(mimeType)
    : cvs.toDataURL(mimeType);
}

/**
 * Writes an image to a file.
 */
export async function writeImageData(
  path: string,
  imageData: canvas.ImageData
): Promise<void> {
  const timer = time(
    debug,
    `writeImageData: ${path} (${imageData.width}×${imageData.height})`
  );
  const cvs = createCanvasWithImageData(imageData);
  const encoded = /\.png$/i.test(path)
    ? cvs.toBuffer('image/png')
    : cvs.toBuffer('image/jpeg');
  await writeFile(path, encoded);
  timer.end();
}

/**
 * Encodes raw image data as a PNG buffer.
 *
 * This function is async because the underlying canvas API can execute some
 * tasks in parallel, such as encoding the image data.
 */
export async function encodeImageData(
  imageData: canvas.ImageData,
  mimeType: 'image/png',
  pngConfig?: canvas.PngConfig
): Promise<Buffer>;

/**
 * Encodes raw image data as a JPEG buffer.
 *
 * This function is async because the underlying canvas API can execute some
 * tasks in parallel, such as encoding the image data.
 */
export async function encodeImageData(
  imageData: canvas.ImageData,
  mimeType: 'image/jpeg',
  pngConfig?: canvas.JpegConfig
): Promise<Buffer>;

/**
 * Encodes raw image data as a PNG or JPEG buffer.
 *
 * This function is async because the underlying canvas API can execute some
 * tasks in parallel, such as encoding the image data.
 */
export async function encodeImageData(
  imageData: canvas.ImageData,
  mimeType: 'image/png' | 'image/jpeg',
  config?: canvas.PngConfig | canvas.JpegConfig
): Promise<Buffer> {
  const timer = time(debug, `writeImageDataToBuffer: ${mimeType}`);
  const cvs = createCanvasWithImageData(imageData);
  const encoded = await new Promise<Buffer>((resolve, reject) => {
    if (mimeType === 'image/png') {
      cvs.toBuffer(
        // @coverage-exclude
        (error, buffer) => (error ? reject(error) : resolve(buffer)),
        mimeType,
        config as canvas.PngConfig
      );
    } else {
      cvs.toBuffer(
        // @coverage-exclude
        (error, buffer) => (error ? reject(error) : resolve(buffer)),
        mimeType,
        config as canvas.JpegConfig
      );
    }
  });
  timer.end();
  return encoded;
}

/**
 * Converts an ImageData to an image Buffer.
 */
export function toImageBuffer(
  imageData: canvas.ImageData,
  mimeType: 'image/png' | 'image/jpeg' = 'image/png'
): Buffer {
  const cvs = createCanvasWithImageData(imageData);
  // Help TS match the union type branches to overloaded function signatures
  return mimeType === 'image/png'
    ? cvs.toBuffer(mimeType)
    : cvs.toBuffer(mimeType);
}
