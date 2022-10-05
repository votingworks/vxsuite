import { createImageData } from 'canvas';
import { MAX_LUM, PIXEL_BLACK, PIXEL_WHITE } from './diff';
import { getImageChannelCount } from './image_data';
import { int } from './types';

/**
 * Outline pixels of a certain color with the same color.
 */
export function outline(
  imageData: ImageData,
  { color = PIXEL_BLACK } = {}
): ImageData {
  const { width, height, data: src } = imageData;
  const channels = getImageChannelCount({ data: src, width, height });
  const result = createImageData(Uint8ClampedArray.from(src), width, height);
  const v1px = width * channels;
  const h1px = channels;
  const pixel = channels === 4 ? [color, color, color, 0xff] : [color];
  const { data: dst } = result;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;

      if (src[offset] === color) {
        if (y > 0) {
          dst.set(pixel, offset - v1px);
        }
        if (y < height - 1) {
          dst.set(pixel, offset + v1px);
        }
        if (x > 0) {
          dst.set(pixel, offset - h1px);
        }
        if (x < width - 1) {
          dst.set(pixel, offset + h1px);
        }
      }
    }
  }

  return result;
}

/**
 * Make any dark colors in an image bolder and bleed into neighboring pixels.
 */
export function embolden(imageData: ImageData): ImageData {
  const { width, height, data: src } = imageData;
  const channels = getImageChannelCount(imageData);
  const result = createImageData(Uint8ClampedArray.from(src), width, height);
  const dst = result.data;
  const v1px = width * channels;
  const h1px = channels;

  for (let y = 0, offset = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, offset += channels) {
      for (let c = 0; c < channels; c += 1) {
        if (c === 3) {
          continue;
        }

        const lum = src[offset + c] as int;

        const upLum = y > 0 ? (src[offset + c - v1px] as int) : MAX_LUM;
        const upDarkLum = MAX_LUM - upLum;
        const downLum =
          y < height - 1 ? (src[offset + c + v1px] as int) : MAX_LUM;
        const downDarkLum = MAX_LUM - downLum;
        const leftLum = x > 0 ? (src[offset + c - h1px] as int) : MAX_LUM;
        const leftDarkLum = MAX_LUM - leftLum;
        const rightLum =
          x < width - 1 ? (src[offset + c + h1px] as int) : MAX_LUM;
        const rightDarkLum = MAX_LUM - rightLum;

        const darkLum = Math.min(
          MAX_LUM - lum + upDarkLum + downDarkLum + leftDarkLum + rightDarkLum,
          MAX_LUM
        );
        dst[offset + c] = MAX_LUM - darkLum;
      }
    }
  }

  return result;
}
