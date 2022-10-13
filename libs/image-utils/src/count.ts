import { Rect } from '@votingworks/types';
import { PIXEL_BLACK } from './diff';
import { getImageChannelCount } from './image_data';
import { float, int } from './types';

/**
 * Options for counting functions.
 */
export interface CountOptions {
  color?: int;
  bounds?: Rect;
}

/**
 * Determines number of black (or custom color) pixels in an image.
 */
export function countPixels(
  image: ImageData,
  {
    color = PIXEL_BLACK,
    bounds = { x: 0, y: 0, width: image.width, height: image.height },
  }: CountOptions = {}
): int {
  const { data } = image;
  const channels = getImageChannelCount(image);
  const { x: startX, y: startY, width, height } = bounds;
  let count = 0;

  for (
    let y = 0, offset = (startY * image.width + startX) * channels;
    y < height;
    y += 1, offset += (image.width - width) * channels
  ) {
    for (let x = 0; x < width; x += 1, offset += channels) {
      if (data[offset] === color) {
        count += 1;
      }
    }
  }

  return count;
}

/**
 * Determines the ratio of black (or custom color) pixels in an image to the
 * total number of pixels.
 */
export function ratio(image: ImageData, options: CountOptions = {}): float {
  const { width, height } = options.bounds ?? image;
  return countPixels(image, options) / (width * height);
}
