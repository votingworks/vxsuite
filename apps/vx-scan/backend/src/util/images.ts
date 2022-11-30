import { safeParseInt } from '@votingworks/types';
import { assert } from '@votingworks/utils';
import { Buffer } from 'buffer';
import { createCanvas, createImageData, ImageData, loadImage } from 'canvas';
import { createWriteStream, promises as fs } from 'fs';
import { parse } from 'path';
import { pipeline } from 'stream/promises';

const GRAY_CHANNEL_COUNT = 1;
const RGB_CHANNEL_COUNT = 3;
const RGBA_CHANNEL_COUNT = 4;

/**
 * Ensures that `imageData` is acceptable to `canvas`.
 */
export function ensureImageData(imageData: globalThis.ImageData): ImageData {
  if (imageData instanceof ImageData) {
    return imageData;
  }
  return createImageData(imageData.data, imageData.width, imageData.height);
}

/**
 * Loads a RAW image from a file.
 */
async function loadRawImage(
  path: string,
  width: number,
  height: number,
  channelCount: number
): Promise<ImageData> {
  assert(
    channelCount === GRAY_CHANNEL_COUNT ||
      channelCount === RGB_CHANNEL_COUNT ||
      channelCount === RGBA_CHANNEL_COUNT
  );

  const imageData = createImageData(width, height);
  const buffer = await fs.readFile(path);

  for (
    let srcOffset = 0, dstOffset = 0;
    srcOffset < buffer.length;
    srcOffset += channelCount, dstOffset += RGBA_CHANNEL_COUNT
  ) {
    imageData.data[dstOffset] = buffer[srcOffset];
    imageData.data[dstOffset + 1] =
      buffer[channelCount > GRAY_CHANNEL_COUNT ? srcOffset + 1 : srcOffset];
    imageData.data[dstOffset + 2] =
      buffer[channelCount > GRAY_CHANNEL_COUNT ? srcOffset + 2 : srcOffset];
    imageData.data[dstOffset + 3] =
      buffer[channelCount > RGB_CHANNEL_COUNT ? srcOffset + 3 : srcOffset];
  }

  return imageData;
}

/**
 * Loads a RAW image from a file. The file name must be in the format
 * `{label}-{width}x{height}-{bitsPerPixel}bpp.raw`. For example:
 * `ballot-1700x2200-24bpp.raw` or `scan-1700x2200-8bpp.raw`.
 */
async function loadRawImageWithMetadataInFileName(
  path: string
): Promise<ImageData> {
  const parts = parse(path);
  const match = parts.name.match(/(\d+)x(\d+)-(\d)bpp/);
  if (!match) {
    throw new Error(`Invalid raw image filename: ${parts.name}`);
  }
  const [, widthResult, heightResult, bitsPerPixelResult] = match.map((n) =>
    safeParseInt(n, { min: 1 })
  );
  if (
    widthResult.isErr() ||
    heightResult.isErr() ||
    bitsPerPixelResult.isErr()
  ) {
    throw new Error(`Invalid raw image filename: ${parts.name}`);
  }

  const width = widthResult.ok();
  const height = heightResult.ok();
  const bitsPerPixel = bitsPerPixelResult.ok();
  const srcBytesPerPixel = Math.round(bitsPerPixel / 8);
  return await loadRawImage(path, width, height, srcBytesPerPixel);
}

export async function loadImageData(path: string): Promise<ImageData>;
export async function loadImageData(data: Buffer): Promise<ImageData>;
export async function loadImageData(
  pathOrData: string | Buffer
): Promise<ImageData> {
  if (typeof pathOrData === 'string') {
    const parts = parse(pathOrData);
    if (parts.ext === '.raw') {
      return loadRawImageWithMetadataInFileName(pathOrData);
    }
  }

  const img = await loadImage(pathOrData);
  const canvas = createCanvas(img.width, img.height);
  const context = canvas.getContext('2d');
  context.drawImage(img, 0, 0);
  return context.getImageData(0, 0, img.width, img.height);
}

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
  await pipeline(imageStream, fileWriter);
}
