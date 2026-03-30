/* istanbul ignore file - @preserve */
import { ImageData } from 'canvas';
import { napi } from './napi';
import { TimingMarks } from './types';

export * from './diagnostic';
export * from './interpret';
export * from './types';

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
