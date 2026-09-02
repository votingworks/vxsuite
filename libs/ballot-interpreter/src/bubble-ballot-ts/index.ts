import { ImageData } from 'canvas';
import { napi } from './napi.js';
import { TimingMarks } from './types.js';

export * from './diagnostic.js';
export * from './interpret.js';
export * from './types.js';

export async function findTimingMarkGrid(
  image: string | ImageData,
  debugBasePath?: string
): Promise<TimingMarks> {
  return typeof image === 'string'
    ? await napi.findTimingMarkGridFromPath(image, debugBasePath)
    : await napi.findTimingMarkGridFromImage(
        image.width,
        image.height,
        image.data,
        debugBasePath
      );
}

/**
 * Encodes image data (RGBA or grayscale) as a grayscale PNG and writes it to
 * disk.
 */
export async function writeImageDataToPng(
  path: string,
  image: ImageData
): Promise<void> {
  await napi.writeImageToPng(path, image.width, image.height, image.data);
}
