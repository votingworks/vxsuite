import { assert } from '@votingworks/basics';
import { time } from '@votingworks/utils';
import { Buffer } from 'node:buffer';
import {
  loadImage as canvasLoadImage,
  createCanvas,
  createImageData,
  ImageData,
  JpegConfig,
  PngConfig,
} from 'canvas';
import makeDebug from 'debug';
import { writeFile } from 'node:fs/promises';
import { assertInteger } from './numeric';
import { int, u8, usize } from './types';

const debug = makeDebug('image-utils');

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
 * Loads an image from a file path or buffer.
 */
export async function loadImageData(
  pathOrData: string | Buffer
): Promise<ImageData> {
  const img = await canvasLoadImage(pathOrData);
  const canvas = createCanvas(img.width, img.height);
  const context = canvas.getContext('2d');
  context.drawImage(img, 0, 0);
  return context.getImageData(0, 0, img.width, img.height);
}

/**
 * Creates an image data from grayscale pixels.
 */
export function fromGrayScale(
  pixels: ArrayLike<u8>,
  width: usize,
  height: usize
): ImageData {
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

function createCanvasWithImageData(imageData: ImageData) {
  const canvas = createCanvas(imageData.width, imageData.height);
  const context = canvas.getContext('2d');
  context.putImageData(ensureImageData(imageData), 0, 0);
  return canvas;
}

/**
 * Creates a data URL from image data.
 */
export function toDataUrl(
  image: ImageData,
  mimeType: 'image/png' | 'image/jpeg'
): string {
  const canvas = createCanvasWithImageData(image);
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
  const timer = time(
    debug,
    `writeImageData: ${path} (${imageData.width}×${imageData.height})`
  );
  const canvas = createCanvasWithImageData(imageData);
  const encoded = /\.png$/i.test(path)
    ? canvas.toBuffer('image/png')
    : canvas.toBuffer('image/jpeg');
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
  imageData: ImageData,
  mimeType: 'image/png',
  pngConfig?: PngConfig
): Promise<Buffer>;

/**
 * Encodes raw image data as a JPEG buffer.
 *
 * This function is async because the underlying canvas API can execute some
 * tasks in parallel, such as encoding the image data.
 */
export async function encodeImageData(
  imageData: ImageData,
  mimeType: 'image/jpeg',
  pngConfig?: JpegConfig
): Promise<Buffer>;

/**
 * Encodes raw image data as a PNG or JPEG buffer.
 *
 * This function is async because the underlying canvas API can execute some
 * tasks in parallel, such as encoding the image data.
 */
export async function encodeImageData(
  imageData: ImageData,
  mimeType: 'image/png' | 'image/jpeg',
  config?: PngConfig | JpegConfig
): Promise<Buffer> {
  const timer = time(debug, `writeImageDataToBuffer: ${mimeType}`);
  const canvas = createCanvasWithImageData(imageData);
  const encoded = await new Promise<Buffer>((resolve, reject) => {
    if (mimeType === 'image/png') {
      canvas.toBuffer(
        /* istanbul ignore next */
        (err, buffer) => (err ? reject(err) : resolve(buffer)),
        mimeType,
        config as PngConfig
      );
    } else {
      canvas.toBuffer(
        /* istanbul ignore next */
        (err, buffer) => (err ? reject(err) : resolve(buffer)),
        mimeType,
        config as JpegConfig
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
