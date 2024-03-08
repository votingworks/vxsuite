import { err, ok, Optional, Result } from '@votingworks/basics';
import { safeParseInt } from '@votingworks/types';
import { Buffer } from 'buffer';
import {
  createCanvas,
  createImageData,
  Image,
  ImageData,
  loadImage as canvasLoadImage,
} from 'canvas';
import { createWriteStream, promises as fs } from 'fs';
import { parse } from 'path';
import { promises as stream } from 'stream';
import { assertInteger } from './numeric';
import { int, usize } from './types';

/**
 * Error kinds that can occur during image processing.
 */
export enum ImageProcessingErrorKind {
  UnsupportedChannelCount = 'UnsupportedChannelCount',
}

/**
 * Error that occurs when an image has an unexpected number of channels.
 */
export interface UnsupportedChannelCountError {
  readonly kind: ImageProcessingErrorKind.UnsupportedChannelCount;
  readonly channelCount: int;
}

/**
 * Errors that can occur during image processing.
 */
export type ImageProcessingError = UnsupportedChannelCountError;

/**
 * The number of channels a grayscale image has (1).
 */
export const GRAY_CHANNEL_COUNT = 1;

/**
 * The number of channels an RGB color image has (3).
 */
export const RGB_CHANNEL_COUNT = 3;

/**
 * The number of channels an RGBA color image has (4).
 */
export const RGBA_CHANNEL_COUNT = 4;

/**
 * Ensures the image data is an instance of ImageData.
 */
export function ensureImageData(imageData: ImageData): ImageData {
  if (imageData instanceof ImageData) {
    return imageData;
  }

  const { data, width, height } = imageData;
  return createImageData(data, width, height);
}

/**
 * Determines the number of channels in an image.
 */
export function getImageChannelCount(image: ImageData): int {
  return assertInteger(image.data.length / image.width / image.height);
}

/**
 * Determines whether the image is RGBA.
 */
export function isRgba(image: ImageData): boolean {
  return getImageChannelCount(image) === RGBA_CHANNEL_COUNT;
}

/**
 * Determines whether the image is RGBA.
 */
export function isGrayscale(image: ImageData): boolean {
  return getImageChannelCount(image) === GRAY_CHANNEL_COUNT;
}

/**
 * Converts an image to an RGBA image.
 */
export function toRgba(
  imageData: ImageData
): Result<ImageData, ImageProcessingError> {
  if (isRgba(imageData)) {
    return ok(ensureImageData(imageData));
  }

  if (isGrayscale(imageData)) {
    const data = new Uint8ClampedArray(imageData.data.length * 4);
    for (
      let sourceIndex = 0, destIndex = 0;
      sourceIndex < imageData.data.length;
      sourceIndex += 1, destIndex += 4
    ) {
      const lum = imageData.data[sourceIndex] as number;
      data[destIndex] = lum;
      data[destIndex + 1] = lum;
      data[destIndex + 2] = lum;
      data[destIndex + 3] = 255;
    }
    return ok(createImageData(data, imageData.width, imageData.height));
  }

  return err({
    kind: ImageProcessingErrorKind.UnsupportedChannelCount,
    channelCount: getImageChannelCount(imageData),
  });
}

/**
 * Converts an image to grayscale.
 */
export function toGrayscale(
  imageData: ImageData
): Result<ImageData, ImageProcessingError> {
  if (isGrayscale(imageData)) {
    return ok(imageData);
  }

  if (!isRgba(imageData)) {
    return err({
      kind: ImageProcessingErrorKind.UnsupportedChannelCount,
      channelCount: getImageChannelCount(imageData),
    });
  }

  const dst = new Uint8ClampedArray(imageData.width * imageData.height);
  const output = createImageData(dst, imageData.width, imageData.height);
  const input32 = new Int32Array(imageData.data.buffer);

  for (let offset = 0, size = input32.length; offset < size; offset += 1) {
    const px = input32[offset] as number;
    const r = px & 0xff;
    const g = (px >>> 8) & 0xff;
    const b = (px >>> 16) & 0xff;

    // Luminosity grayscale formula.
    const luminosity = (0.21 * r + 0.72 * g + 0.07 * b) | 0;
    dst[offset] = luminosity;
  }

  return ok(output);
}

/**
 * Loads a Portable GrayMap binary (PGM P5) image from a buffer. We only support
 * this because it's the format used by `customctl` for now.
 *
 * @see https://en.wikipedia.org/wiki/Netpbm
 */
function loadPgmImageData(buffer: Buffer): ImageData | undefined {
  const intro = buffer.toString('utf8', 0, 100);
  const match = intro.match(/P5\n(\d+) (\d+)\n(\d+)\n/);

  if (!match) {
    return;
  }

  const [header, widthString, heightString, maxString] = match;
  const width = safeParseInt(widthString, { min: 1 }).assertOk(
    `Invalid PGM image width: ${widthString}`
  );
  const height = safeParseInt(heightString, { min: 1 }).assertOk(
    `Invalid PGM image height: ${heightString}`
  );
  safeParseInt(maxString, { min: 255, max: 255 }).assertOk(
    `Invalid PGM image max: ${maxString}`
  );

  const data = buffer.subarray(header.length);
  return createImageData(Uint8ClampedArray.from(data), width, height);
}

/**
 * Loads a Portable GrayMap binary (PGM P5) image from a file. We only support
 * this because it's the format used by `customctl` for now.
 *
 * @see https://en.wikipedia.org/wiki/Netpbm
 */
async function loadPgmFile(path: string): Promise<ImageData> {
  const buffer = await fs.readFile(path);
  const imageData = loadPgmImageData(buffer);

  if (!imageData) {
    throw new Error(`Invalid PGM image: ${path}`);
  }

  return imageData;
}

const DATA_URL_PATTERN = /^data:([-a-z\d]+\/[-a-z\d]+);base64,(.*)$/i;

/**
 * Tries to load PGM image data from a file path or data URL.
 */
export async function tryLoadPgmImageData(
  pathOrDataUrl: string
): Promise<Optional<ImageData>> {
  const dataUrlMatch = pathOrDataUrl.match(DATA_URL_PATTERN);

  if (dataUrlMatch) {
    const [, mimeType, base64] = dataUrlMatch;
    if (mimeType === 'image/x-portable-graymap' && base64) {
      const buffer = Buffer.from(base64, 'base64');
      const imageData = loadPgmImageData(buffer);
      if (imageData) {
        return imageData;
      }
    }
  }

  const parts = parse(pathOrDataUrl);
  if (parts.ext === '.pgm') {
    return loadPgmFile(pathOrDataUrl);
  }
}

/**
 * Loads an image from a file path or data URL.
 */
export async function loadImage(pathOrDataUrl: string): Promise<Image> {
  const imageData = await tryLoadPgmImageData(pathOrDataUrl);

  if (imageData) {
    const image = new Image();
    const canvas = createCanvas(imageData.width, imageData.height);
    const context = canvas.getContext('2d');
    context.putImageData(toRgba(imageData).assertOk('convert to RGBA'), 0, 0);
    image.src = canvas.toDataURL();
    return image;
  }

  return await canvasLoadImage(pathOrDataUrl);
}

/**
 * Loads an image from a file path.
 */
export async function loadImageData(path: string): Promise<ImageData>;
/**
 * Loads an image from a buffer.
 */
export async function loadImageData(data: Buffer): Promise<ImageData>;
/**
 * Loads an image from a file path or buffer.
 */
export async function loadImageData(
  pathOrData: string | Buffer
): Promise<ImageData> {
  if (typeof pathOrData === 'string') {
    const imageData = await tryLoadPgmImageData(pathOrData);

    if (imageData) {
      return imageData;
    }
  }

  const img = await canvasLoadImage(pathOrData);
  const canvas = createCanvas(img.width, img.height);
  const context = canvas.getContext('2d');
  context.drawImage(img, 0, 0);
  return context.getImageData(0, 0, img.width, img.height);
}

/**
 * Creates a data URL from image data.
 */
export function toDataUrl(
  image: ImageData,
  mimeType: 'image/png' | 'image/jpeg' | 'image/x-portable-graymap'
): string {
  if (mimeType === 'image/x-portable-graymap') {
    const channelCount = getImageChannelCount(image);
    if (channelCount !== GRAY_CHANNEL_COUNT) {
      throw new Error('image/x-portable-graymap only supports one channel');
    }

    const buffer = Buffer.concat([
      Buffer.from('P5\n'),
      Buffer.from(`${image.width} ${image.height}\n`),
      Buffer.from('255\n'),
      Buffer.from(image.data),
    ]);
    return `data:image/x-portable-graymap;base64,${buffer.toString('base64')}`;
  }

  const { width, height } = image;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.putImageData(image, 0, 0);
  return mimeType === 'image/jpeg'
    ? canvas.toDataURL(mimeType)
    : canvas.toDataURL(mimeType);
}

/**
 * Writes an image to a file.
 */
export async function writeImageData(
  path: string,
  imageData: ImageData
): Promise<void> {
  const canvas = createCanvas(imageData.width, imageData.height);
  const context = canvas.getContext('2d');
  context.putImageData(ensureImageData(imageData), 0, 0);

  const fileWriter = createWriteStream(path);
  const imageStream = /\.png$/i.test(path)
    ? canvas.createPNGStream()
    : canvas.createJPEGStream();
  await stream.pipeline(imageStream, fileWriter);
}

/**
 * Converts an ImageData to an image Buffer.
 */
export function toImageBuffer(
  imageData: ImageData,
  mimeType: 'image/png' | 'image/jpeg' = 'image/png'
): Buffer {
  const canvas = createCanvas(imageData.width, imageData.height);
  const context = canvas.getContext('2d');
  context.putImageData(ensureImageData(imageData), 0, 0);
  // Help TS match the union type branches to overloaded function signatures
  return mimeType === 'image/png'
    ? canvas.toBuffer(mimeType)
    : canvas.toBuffer(mimeType);
}

/**
 * Extracts image data from an image.
 */
export function toImageData(
  image: Image,
  {
    maxWidth = image.width,
    maxHeight = image.height,
  }: {
    maxWidth?: usize;
    maxHeight?: usize;
  } = {}
): ImageData {
  const xScale = maxWidth / image.width;
  const yScale = maxHeight / image.height;
  const scale = Math.min(xScale, yScale);
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');

  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}
