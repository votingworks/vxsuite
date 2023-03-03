import { throwIllegalValue } from '@votingworks/basics';
import { Optional, safeParseInt } from '@votingworks/types';
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
import { PIXEL_WHITE } from './constants';
import { assertInteger } from './numeric';
import { otsu } from './otsu';
import { AnyImage, GrayImage, int, RgbaImage, u8, usize } from './types';

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
export function isRgba(image: AnyImage): image is RgbaImage {
  return image.channels === RGBA_CHANNEL_COUNT;
}

/**
 * Determines whether the image is RGBA.
 */
export function isGrayscale(image: AnyImage): image is GrayImage {
  return image.channels === GRAY_CHANNEL_COUNT;
}

const DATA_URL_PATTERN = /^data:([-a-z\d]+\/[-a-z\d]+);base64,(.*)$/i;

/**
 * Options for loading an image.
 */
export interface LoadImageOptions {
  readonly maxWidth?: usize;
  readonly maxHeight?: usize;
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
 * Writes an image to a file.
 */
export async function writeImage(path: string, image: AnyImage): Promise<void> {
  await writeImageData(path, image.asImageData());
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

/* eslint-disable no-param-reassign -- this function takes ownership of `imageData` */
function wrapGrayImageData(imageData: ImageData): GrayImage {
  const grayImage: GrayImage = {
    channels: GRAY_CHANNEL_COUNT,
    step: GRAY_CHANNEL_COUNT,
    length: imageData.data.length / GRAY_CHANNEL_COUNT,
    width: imageData.width,
    height: imageData.height,

    at(x, y) {
      if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
        throw new Error(`Pixel out of bounds: (${x}, ${y})`);
      }

      if (x !== Math.floor(x) || y !== Math.floor(y)) {
        throw new Error(`Non-integer pixel coordinates: (${x}, ${y})`);
      }

      return imageData.data[y * imageData.width + x] as u8;
    },

    raw(offset) {
      if (offset < 0 || offset >= imageData.data.length) {
        throw new Error(`Pixel out of bounds: ${offset}`);
      }

      return imageData.data[offset] as u8;
    },

    setAt(x, y, value) {
      if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
        throw new Error(`Pixel out of bounds: (${x}, ${y})`);
      }

      if (x !== Math.floor(x) || y !== Math.floor(y)) {
        throw new Error(`Non-integer pixel coordinates: (${x}, ${y})`);
      }

      const offset = y * imageData.width + x;
      imageData.data[offset] = value;
    },

    setRaw(offset, value) {
      imageData.data[offset] = value;
    },

    row(y) {
      if (y < 0 || y >= imageData.height) {
        throw new Error(`Row out of bounds: ${y}`);
      }

      const valuesPerRow = imageData.width;
      const start = y * valuesPerRow;
      const end = start + valuesPerRow;
      return imageData.data.subarray(start, end);
    },

    isRgba() {
      return false;
    },

    isGray() {
      return true;
    },

    toRgba() {
      const data = new Uint8ClampedArray(
        imageData.data.length * RGBA_CHANNEL_COUNT
      );
      for (
        let sourceIndex = 0, destIndex = 0;
        sourceIndex < imageData.data.length;
        sourceIndex += 1, destIndex += RGBA_CHANNEL_COUNT
      ) {
        const lum = imageData.data[sourceIndex] as u8;
        data[destIndex] = lum;
        data[destIndex + 1] = lum;
        data[destIndex + 2] = lum;
        data[destIndex + 3] = 255;
      }
      return wrapRgbaImageData(
        createImageData(data, imageData.width, imageData.height)
      );
    },

    toGray() {
      return grayImage;
    },

    binarize(threshold: u8 = otsu(grayImage)) {
      const { data, width, height } = imageData;
      const result = createImageData(
        new Uint8ClampedArray(data.length),
        width,
        height
      );

      for (let offset = 0, { length } = data; offset < length; offset += 1) {
        const lum = data[offset] as number;
        result.data[offset] = lum > threshold ? 255 : 0;
      }

      return wrapGrayImageData(result);
    },

    asImageData() {
      return imageData;
    },

    asDataUrl(mimeType) {
      if (mimeType === 'image/x-portable-graymap') {
        const buffer = Buffer.concat([
          Buffer.from('P5\n'),
          Buffer.from(`${imageData.width} ${imageData.height}\n`),
          Buffer.from('255\n'),
          Buffer.from(imageData.data),
        ]);
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
      }

      return grayImage.toRgba().asDataUrl(mimeType);
    },

    outline({ color }): GrayImage {
      const { data: src, width, height } = imageData;
      const result = createImageData(
        Uint8ClampedArray.from(src),
        width,
        height
      );
      const v1px = width;
      const h1px = 1;
      const { data: dst } = result;

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = y * width + x;

          if (src[offset] === color) {
            if (y > 0) {
              dst[offset - v1px] = color;
            }
            if (y < height - 1) {
              dst[offset + v1px] = color;
            }
            if (x > 0) {
              dst[offset - h1px] = color;
            }
            if (x < width - 1) {
              dst[offset + h1px] = color;
            }
          }
        }
      }

      return wrapGrayImageData(result);
    },

    crop(bounds) {
      const { data: src, width: srcWidth } = imageData;
      const dst = new Uint8ClampedArray(bounds.width * bounds.height);
      const {
        x: srcOffsetX,
        y: srcOffsetY,
        width: dstWidth,
        height: dstHeight,
      } = bounds;

      for (let y = 0; y < dstHeight; y += 1) {
        const srcOffset = (srcOffsetY + y) * srcWidth + srcOffsetX;
        const dstOffset = y * dstWidth;
        dst.set(src.subarray(srcOffset, srcOffset + dstWidth), dstOffset);
      }

      return wrapGrayImageData(createImageData(dst, dstWidth, dstHeight));
    },

    count({
      color,
      bounds = { x: 0, y: 0, width: imageData.width, height: imageData.height },
    }) {
      const { x: startX, y: startY, width, height } = bounds;
      let count = 0;

      for (
        let y = 0, offset = startY * imageData.width + startX;
        y < height;
        y += 1, offset += imageData.width - width
      ) {
        for (let x = 0; x < width; x += 1, offset += 1) {
          if (imageData.data[offset] === color) {
            count += 1;
          }
        }
      }

      return count;
    },

    diff(
      compare,
      baseBounds = {
        x: 0,
        y: 0,
        width: imageData.width,
        height: imageData.height,
      },
      compareBounds = {
        x: 0,
        y: 0,
        width: compare.width,
        height: compare.height,
      }
    ) {
      if (
        baseBounds.width !== compareBounds.width ||
        baseBounds.height !== compareBounds.height
      ) {
        throw new Error(
          `baseBounds and compareBounds must have the same size, got ${baseBounds.width}x${baseBounds.height} and ${compareBounds.width}x${compareBounds.height}`
        );
      }

      const { width: baseWidth } = imageData;
      const { width: compareWidth } = compare;
      const { x: baseXOffset, y: baseYOffset } = baseBounds;
      const { x: compareXOffset, y: compareYOffset } = compareBounds;
      const { width: dstWidth, height: dstHeight } = baseBounds;
      const dst = new Uint8ClampedArray(dstWidth * dstHeight);

      for (let y = 0; y < dstHeight; y += 1) {
        for (let x = 0; x < dstWidth; x += 1) {
          const baseOffset = baseXOffset + x + (baseYOffset + y) * baseWidth;
          const compareOffset =
            compareXOffset + x + (compareYOffset + y) * compareWidth;
          const dstOffset = x + y * dstWidth;

          const lumDiff =
            (imageData.data[baseOffset] as u8) - compare.raw(compareOffset);
          dst[dstOffset] = PIXEL_WHITE - Math.max(lumDiff, 0);
        }
      }

      return wrapGrayImageData(createImageData(dst, dstWidth, dstHeight));
    },

    copy() {
      return wrapGrayImageData(
        createImageData(
          Uint8ClampedArray.from(imageData.data),
          imageData.width,
          imageData.height
        )
      );
    },

    fill(color) {
      imageData.data.fill(color);
      return grayImage;
    },

    rotate180() {
      const rotated = createImageData(
        Uint8ClampedArray.from(imageData.data),
        imageData.width,
        imageData.height
      );

      for (
        let head = 0, tail = rotated.data.length - 1;
        head < tail;
        head += 1, tail -= 1
      ) {
        const temp = rotated.data[head] as u8;
        rotated.data[head] = rotated.data[tail] as u8;
        rotated.data[tail] = temp;
      }

      return wrapGrayImageData(rotated);
    },
  };

  return grayImage;
}
/* eslint-enable no-param-reassign */

/* eslint-disable no-param-reassign -- this function takes ownership of `imageData` */
function wrapRgbaImageData(imageData: ImageData): RgbaImage {
  const rgbaImage: RgbaImage = {
    channels: RGBA_CHANNEL_COUNT,
    step: RGBA_CHANNEL_COUNT,
    length: imageData.data.length / RGBA_CHANNEL_COUNT,
    width: imageData.width,
    height: imageData.height,

    at(x, y) {
      // Assume the image is actually grayscale stored as RGBA.
      if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
        throw new Error(`Pixel out of bounds: (${x}, ${y})`);
      }

      if (x !== Math.floor(x) || y !== Math.floor(y)) {
        throw new Error(`Non-integer pixel coordinates: (${x}, ${y})`);
      }

      return imageData.data[(y * imageData.width + x) * 4] as number;
    },

    raw(offset) {
      if (offset < 0 || offset >= imageData.data.length) {
        throw new Error(`Pixel out of bounds: ${offset}`);
      }

      return imageData.data[offset] as u8;
    },

    setAt(x, y, value) {
      if (x < 0 || x >= imageData.width || y < 0 || y >= imageData.height) {
        throw new Error(`Pixel out of bounds: (${x}, ${y})`);
      }

      if (x !== Math.floor(x) || y !== Math.floor(y)) {
        throw new Error(`Non-integer pixel coordinates: (${x}, ${y})`);
      }

      const offset = (y * imageData.width + x) * RGBA_CHANNEL_COUNT;
      imageData.data[offset] = value;
      imageData.data[offset + 1] = value;
      imageData.data[offset + 2] = value;
      imageData.data[offset + 3] = 255;
    },

    setRaw(offset, value) {
      imageData.data[offset] = value;
      imageData.data[offset + 1] = value;
      imageData.data[offset + 2] = value;
      imageData.data[offset + 3] = 255;
    },

    row(y) {
      if (y < 0 || y >= imageData.height) {
        throw new Error(`Row out of bounds: ${y}`);
      }

      const valuesPerRow = imageData.width * RGBA_CHANNEL_COUNT;
      const start = y * valuesPerRow;
      const end = start + valuesPerRow;
      return imageData.data.subarray(start, end);
    },

    isRgba() {
      return true;
    },

    isGray() {
      return false;
    },

    toRgba() {
      return rgbaImage;
    },

    toGray() {
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

      return wrapGrayImageData(output);
    },

    binarize(threshold?: u8) {
      return rgbaImage.toGray().binarize(threshold);
    },

    asImageData() {
      return imageData;
    },

    asDataUrl(mimeType) {
      if (mimeType === 'image/x-portable-graymap') {
        return rgbaImage.toGray().asDataUrl(mimeType);
      }

      const { width, height } = imageData;
      const canvas = createCanvas(width, height);
      const context = canvas.getContext('2d');
      context.putImageData(imageData, 0, 0);
      return mimeType === 'image/jpeg'
        ? canvas.toDataURL(mimeType)
        : mimeType === 'image/png'
        ? canvas.toDataURL(mimeType)
        : throwIllegalValue(mimeType as never);
    },

    crop(bounds) {
      const { data: src, width: srcWidth } = imageData;
      const dst = new Uint8ClampedArray(
        bounds.width * bounds.height * RGBA_CHANNEL_COUNT
      );
      const {
        x: srcOffsetX,
        y: srcOffsetY,
        width: dstWidth,
        height: dstHeight,
      } = bounds;

      for (let y = 0; y < dstHeight; y += 1) {
        const srcOffset = (srcOffsetY + y) * srcWidth + srcOffsetX;
        const dstOffset = y * dstWidth;
        dst.set(
          src.subarray(
            srcOffset * RGBA_CHANNEL_COUNT,
            (srcOffset + dstWidth) * RGBA_CHANNEL_COUNT
          ),
          dstOffset * RGBA_CHANNEL_COUNT
        );
      }

      return wrapRgbaImageData(createImageData(dst, dstWidth, dstHeight));
    },

    copy() {
      return wrapRgbaImageData(
        createImageData(
          Uint8ClampedArray.from(imageData.data),
          imageData.width,
          imageData.height
        )
      );
    },

    rotate180() {
      const rotated = createImageData(
        Uint8ClampedArray.from(imageData.data),
        imageData.width,
        imageData.height
      );

      for (
        let head = 0, tail = rotated.data.length - RGBA_CHANNEL_COUNT;
        head < tail;
        head += RGBA_CHANNEL_COUNT, tail -= RGBA_CHANNEL_COUNT
      ) {
        let temp = rotated.data[head] as u8;
        rotated.data[head] = rotated.data[tail] as u8;
        rotated.data[tail] = temp;

        temp = rotated.data[head + 1] as u8;
        rotated.data[head + 1] = rotated.data[tail + 1] as u8;
        rotated.data[tail + 1] = temp;

        temp = rotated.data[head + 2] as u8;
        rotated.data[head + 2] = rotated.data[tail + 2] as u8;
        rotated.data[tail + 2] = temp;

        temp = rotated.data[head + 3] as u8;
        rotated.data[head + 3] = rotated.data[tail + 3] as u8;
        rotated.data[tail + 3] = temp;
      }

      return wrapRgbaImageData(rotated);
    },
  };

  return rgbaImage;
}
/* eslint-enable no-param-reassign */

/**
 * Wraps an `ImageData` object as an `RgbaImage` or `GrayImage`.
 */
export function wrapImageData(imageData: ImageData): AnyImage {
  const channelCount = getImageChannelCount(imageData);

  if (channelCount === RGBA_CHANNEL_COUNT) {
    return wrapRgbaImageData(imageData);
  }

  if (channelCount === GRAY_CHANNEL_COUNT) {
    return wrapGrayImageData(imageData);
  }

  throw new Error(`Unsupported channel count: ${channelCount}`);
}

/**
 * Loads a Portable GrayMap binary (PGM P5) image from a buffer. We only support
 * this because it's the format used by `customctl` for now.
 *
 * @see https://en.wikipedia.org/wiki/Netpbm
 */
function loadPgmImageData(buffer: Buffer): GrayImage | undefined {
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

  const data = buffer.subarray((header as string).length);
  return wrapGrayImageData(
    createImageData(Uint8ClampedArray.from(data), width, height)
  );
}

/**
 * Loads a Portable GrayMap binary (PGM P5) image from a file. We only support
 * this because it's the format used by `customctl` for now.
 *
 * @see https://en.wikipedia.org/wiki/Netpbm
 */
async function loadPgmFile(path: string): Promise<GrayImage> {
  const buffer = await fs.readFile(path);
  const imageData = loadPgmImageData(buffer);

  if (!imageData) {
    throw new Error(`Invalid PGM image: ${path}`);
  }

  return imageData;
}

/**
 * Tries to load PGM image data from a file path or data URL.
 */
export async function tryLoadPgmImage(
  pathOrDataUrl: string
): Promise<Optional<GrayImage>> {
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
 * Loads an image from a file path.
 */
export async function loadImage(
  path: string,
  options?: LoadImageOptions
): Promise<AnyImage>;
/**
 * Loads an image from a buffer.
 */
export async function loadImage(
  data: Buffer,
  options?: LoadImageOptions
): Promise<AnyImage>;

/**
 * Loads an image from a file path or buffer.
 */
export async function loadImage(
  pathOrData: string | Buffer,
  { maxWidth, maxHeight }: LoadImageOptions = {}
): Promise<AnyImage> {
  if (typeof pathOrData === 'string') {
    const imageData = await tryLoadPgmImage(pathOrData);

    if (imageData) {
      return imageData;
    }
  }

  const img = await canvasLoadImage(pathOrData);
  const canvas = createCanvas(img.width, img.height);
  const context = canvas.getContext('2d');
  const xScale = (maxWidth ?? img.width) / img.width;
  const yScale = (maxHeight ?? img.height) / img.height;
  const scale = Math.min(xScale, yScale);
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  context.drawImage(img, 0, 0, width, height);
  return wrapImageData(context.getImageData(0, 0, width, height));
}

/**
 * Loads an image in grayscale from a file path.
 */
export async function loadGrayImage(
  path: string,
  options?: LoadImageOptions
): Promise<GrayImage>;
/**
 * Loads an image in grayscale from a buffer.
 */
export async function loadGrayImage(
  data: Buffer,
  options?: LoadImageOptions
): Promise<GrayImage>;

/**
 * Loads an image in grayscale from a file path or buffer.
 */
export async function loadGrayImage(
  pathOrData: string | Buffer,
  { maxWidth, maxHeight }: LoadImageOptions = {}
): Promise<GrayImage> {
  if (typeof pathOrData === 'string') {
    const image = await tryLoadPgmImage(pathOrData);

    if (image) {
      return image;
    }
  }

  const img = await canvasLoadImage(pathOrData);
  const canvas = createCanvas(img.width, img.height);
  const context = canvas.getContext('2d');
  const xScale = (maxWidth ?? img.width) / img.width;
  const yScale = (maxHeight ?? img.height) / img.height;
  const scale = Math.min(xScale, yScale);
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  context.drawImage(img, 0, 0, width, height);
  return wrapImageData(context.getImageData(0, 0, width, height)).toGray();
}
