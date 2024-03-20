import { Buffer } from 'buffer';
import {
  loadImage as canvasLoadImage,
  createCanvas,
  createImageData,
  Image,
  ImageData,
} from 'canvas';
import { createWriteStream } from 'fs';
import { promises as stream } from 'stream';
import { assert } from '@votingworks/basics';
import { assertInteger } from './numeric';
import { int, u8, usize } from './types';

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
 * Loads an image from a file path or data URL.
 */
export async function loadImage(pathOrDataUrl: string): Promise<Image> {
  return await canvasLoadImage(pathOrDataUrl);
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
