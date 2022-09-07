import { err, ok, Result } from '@votingworks/types';
import { deferred } from '@votingworks/utils';
import {
  createCanvas,
  createImageData,
  Image,
  ImageData,
  loadImage as canvasLoadImage,
} from 'canvas';
import { createWriteStream } from 'fs';
import { extname } from 'path';
import { assertInteger } from './numeric';
import { int, usize } from './types';

/**
 * Error kinds that can occur during image processing.
 */
export enum ImageProcessingErrorKind {
  UnsupportedChannelCount = 'UnsupportedChannelCount',
  UnsupportedImageFormat = 'UnsupportedImageFormat',
  WriteError = 'WriteError',
}

/**
 * Error that occurs when an image has an unexpected number of channels.
 */
export interface UnsupportedChannelCountError {
  readonly kind: ImageProcessingErrorKind.UnsupportedChannelCount;
  readonly channelCount: int;
}

/**
 * Error that occurs when an image has an unsupported format.
 */
export interface UnsupportedImageFormatError {
  readonly kind: ImageProcessingErrorKind.UnsupportedImageFormat;
  readonly format: string;
}

/**
 * Error that occurs when writing an image to disk.
 */
export interface WriteError {
  readonly kind: ImageProcessingErrorKind.WriteError;
  readonly error: Error;
}

/**
 * Errors that can occur during image processing.
 */
export type ImageProcessingError =
  | UnsupportedChannelCountError
  | UnsupportedImageFormatError
  | WriteError;

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

  const { data, width, height } = imageData as ImageData;
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
 * Loads an image from a file path.
 */
export async function loadImage(path: string): Promise<Image> {
  return await canvasLoadImage(path);
}

/**
 * Creates a PNG image stream from image data.
 */
export function createPngStream(image: ImageData): NodeJS.ReadableStream {
  const { width, height } = image;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.putImageData(image, 0, 0);
  return canvas.createPNGStream();
}

/**
 * Creates a JPEG image stream from image data.
 */
export function createJpegStream(image: ImageData): NodeJS.ReadableStream {
  const { width, height } = image;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.putImageData(image, 0, 0);
  return canvas.createJPEGStream();
}

/**
 * Creates a data URL from image data.
 */
export function toDataUrl(
  image: ImageData,
  mimeType: 'image/png' | 'image/jpeg'
): string {
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
  image: ImageData
): Promise<Result<void, ImageProcessingError>> {
  const { promise, resolve } = deferred<Result<void, ImageProcessingError>>();

  if (path.endsWith('.png')) {
    createPngStream(image)
      .pipe(createWriteStream(path))
      .on('finish', () => resolve(ok()))
      .on('error', (error) =>
        resolve(
          err({
            kind: ImageProcessingErrorKind.WriteError,
            error,
          })
        )
      );
  } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
    createJpegStream(image)
      .pipe(createWriteStream(path))
      .on('finish', () => resolve(ok()))
      .on('error', (error) =>
        resolve(
          err({
            kind: ImageProcessingErrorKind.WriteError,
            error,
          })
        )
      );
  } else {
    resolve(
      err({
        kind: ImageProcessingErrorKind.UnsupportedImageFormat,
        format: extname(path),
      })
    );
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
