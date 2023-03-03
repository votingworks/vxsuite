import { getImageChannelCount, GrayImage } from '@votingworks/image-utils';
import { assert } from '@votingworks/basics';
import { Point } from './types';

/**
 * Matches an image against a template image. Assumes the images are grayscale,
 * even if they're stored as RGBA.
 *
 * @param image The image to match within.
 * @param template The template image to match against.
 * @param point The top-left point in the image to start matching.
 * @param minScore The minimum score to consider a match. Providing a value
 *                 here will speed up the matching process.
 *
 * @returns A score between 0 and 1, where 1 is a perfect match. If a minimum
 *          score is provided, returns -1 if the score is below that.
 */
export function matchTemplate(
  image: GrayImage,
  template: GrayImage,
  point: Point,
  minScore = 0
): number {
  const { width: templateWidth, height: templateHeight } = template;
  const px = point.x;
  const py = point.y;

  const cutoff = 1 - minScore;
  const maxDiff = templateWidth * templateHeight * 255;
  let diff = 0;
  for (let y = 0; y < templateHeight; y += 1) {
    for (let x = 0; x < templateWidth; x += 1) {
      const lum = image.at(px + x, py + y);
      const templateLum = template.at(x, y);
      diff += Math.abs(lum - templateLum);
    }

    if (cutoff < 1 && diff / maxDiff > cutoff) {
      return -1;
    }
  }

  return 1 - diff / maxDiff;
}

/**
 * Scores a template match result image by measuring the total luminosity of the
 * image compared to a mask.
 */
export function scoreTemplateMatch(image: ImageData, mask: ImageData): number {
  const imageChannels = getImageChannelCount(image);
  const maskChannels = getImageChannelCount(mask);

  assert(image.width === mask.width, 'expected same width');
  assert(image.height === mask.height, 'expected same height');

  let maxDiff = 0;
  let diff = 0;

  for (
    let offset = 0, maskOffset = 0;
    offset < image.data.length;
    offset += imageChannels, maskOffset += maskChannels
  ) {
    const lum = image.data[offset] as number;
    if (mask.data[maskOffset] === 255) {
      diff += Math.abs(lum - 255);
      maxDiff += 255;
    }
  }

  return 1 - diff / maxDiff;
}
