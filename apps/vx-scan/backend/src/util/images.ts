import { createCanvas, createImageData, ImageData } from 'canvas';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

/**
 * Ensures that `imageData` is acceptable to `canvas`.
 */
export function ensureImageData(imageData: globalThis.ImageData): ImageData {
  if (imageData instanceof ImageData) {
    return imageData;
  }
  return createImageData(imageData.data, imageData.width, imageData.height);
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
