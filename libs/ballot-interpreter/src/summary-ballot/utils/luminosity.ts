import { ImageData } from 'canvas';
import { assertDefined } from '@votingworks/basics';
import { Rect } from '@votingworks/types';
import makeDebug from 'debug';

const debug = makeDebug('ballot-interpreter:bmd:luminosity');

export interface Stats {
  threshold: number;
  foreground: LuminosityCounts;
  background: LuminosityCounts;
}

export interface LuminosityCounts {
  count: number;
  ratio: number;
}

/**
 * Gets luminosity stats for image data, counting pixels as either
 * foreground or background based on `threshold`.
 */
export function stats(
  { data, width, height }: ImageData,
  { threshold, bounds }: { threshold: number; bounds: Rect }
): Stats {
  const start = Date.now();
  const channels = data.length / (width * height);
  const pixelCount = bounds.width * bounds.height;

  let foreground = 0;
  for (let { x } = bounds; x < bounds.x + bounds.width; x += 1) {
    for (let { y } = bounds; y < bounds.y + bounds.height; y += 1) {
      const pixel = assertDefined(data[(y * width + x) * channels]);
      if (pixel < threshold) {
        foreground += 1;
      }
    }
  }

  const background = pixelCount - foreground;

  const result: Stats = {
    threshold,
    foreground: {
      count: foreground,
      ratio: foreground / pixelCount,
    },
    background: {
      count: background,
      ratio: background / pixelCount,
    },
  };

  const end = Date.now();
  debug(
    'computed luminosity stats on %d pixels (%o) in %dms: %O',
    pixelCount,
    bounds,
    end - start,
    result
  );

  return result;
}
