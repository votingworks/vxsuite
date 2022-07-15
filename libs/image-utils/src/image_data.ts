import { deferred } from '@votingworks/utils';
import {
  createCanvas,
  Image,
  ImageData,
  loadImage as canvasLoadImage,
} from 'canvas';
import { createWriteStream } from 'fs';
import { assertInteger } from './numeric';
import { int, usize } from './types';

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
 * Loads an image from a file path.
 */
export async function loadImage(path: string): Promise<Image> {
  return await canvasLoadImage(path);
}

/**
 * Writes an image to a file.
 */
export async function writeImageData(
  path: string,
  image: ImageData
): Promise<void> {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.putImageData(image, 0, 0);

  const { promise, resolve, reject } = deferred<void>();

  if (path.endsWith('.png')) {
    canvas
      .createPNGStream()
      .pipe(createWriteStream(path))
      .on('finish', resolve)
      .on('error', reject);
  } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
    canvas
      .createJPEGStream()
      .pipe(createWriteStream(path))
      .on('finish', resolve)
      .on('error', reject);
  } else {
    throw new Error(`Unsupported image format: ${path}`);
  }

  return promise;
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
