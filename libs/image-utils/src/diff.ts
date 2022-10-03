import { Rect } from '@votingworks/types';
import { createImageData } from 'canvas';
import { getImageChannelCount } from './image_data';
import { int } from './types';

/** Luminosity value for a completely black pixel. */
export const PIXEL_BLACK = 0x00;
/** Luminosity value for a completely white pixel. */
export const PIXEL_WHITE = 0xff;

/**
 * Generates an image from two binarized images where black pixels are where
 * `compare` is black and `base` is not. This is useful for determining where a
 * white-background form was filled out, for example.
 *
 * Note that the sizes of the bounds, which default to the full image size, must
 * be equal.
 *
 * ```
 *         BASE                  COMPARE                 DIFF
 * ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
 * │                   │  │        █ █ ███    │  │        █ █ ███    │
 * │ █ █               │  │ █ █    ███  █     │  │        ███  █     │
 * │  █                │  │  █     █ █ ███    │  │        █ █ ███    │
 * │ █ █ █████████████ │  │ █ █ █████████████ │  │                   │
 * └───────────────────┘  └───────────────────┘  └───────────────────┘
 * ```
 */
export function diff(
  base: ImageData,
  compare: ImageData,
  baseBounds: Rect = { x: 0, y: 0, width: base.width, height: base.height },
  compareBounds: Rect = {
    x: 0,
    y: 0,
    width: compare.width,
    height: compare.height,
  }
): ImageData {
  const baseChannelCount = getImageChannelCount(base);
  const compareChannelCount = getImageChannelCount(compare);

  if (baseChannelCount !== compareChannelCount) {
    throw new Error(
      `base and compare must have the same number of channels, got ${baseChannelCount} and ${compareChannelCount}`
    );
  }

  if (
    baseBounds.width !== compareBounds.width ||
    baseBounds.height !== compareBounds.height
  ) {
    throw new Error(
      `baseBounds and compareBounds must have the same size, got ${baseBounds.width}x${baseBounds.height} and ${compareBounds.width}x${compareBounds.height}`
    );
  }

  const { data: baseData, width: baseWidth } = base;
  const { data: compareData, width: compareWidth } = compare;
  const { x: baseXOffset, y: baseYOffset } = baseBounds;
  const { x: compareXOffset, y: compareYOffset } = compareBounds;
  const { width: dstWidth, height: dstHeight } = baseBounds;
  let dst: Uint8ClampedArray;

  switch (baseChannelCount) {
    case 4: {
      dst = new Uint8ClampedArray(dstWidth * dstHeight * 4);

      for (let y = 0; y < dstHeight; y += 1) {
        for (let x = 0; x < dstWidth; x += 1) {
          const baseOffset =
            (baseXOffset + x + (baseYOffset + y) * baseWidth) << 2;
          const compareOffset =
            (compareXOffset + x + (compareYOffset + y) * compareWidth) << 2;
          const dstOffset = (x + y * dstWidth) << 2;

          if (
            baseData[baseOffset] === PIXEL_BLACK &&
            baseData[baseOffset + 1] === PIXEL_BLACK &&
            baseData[baseOffset + 2] === PIXEL_BLACK
          ) {
            dst[dstOffset] = PIXEL_WHITE;
            dst[dstOffset + 1] = PIXEL_WHITE;
            dst[dstOffset + 2] = PIXEL_WHITE;
          } else {
            dst[dstOffset] = compareData[compareOffset] as int;
            dst[dstOffset + 1] = compareData[compareOffset + 1] as int;
            dst[dstOffset + 2] = compareData[compareOffset + 2] as int;
          }
          dst[dstOffset + 3] = 0xff;
        }
      }
      break;
    }

    case 1: {
      dst = new Uint8ClampedArray(dstWidth * dstHeight);

      for (let y = 0; y < dstHeight; y += 1) {
        for (let x = 0; x < dstWidth; x += 1) {
          const baseOffset = baseXOffset + x + (baseYOffset + y) * baseWidth;
          const compareOffset =
            compareXOffset + x + (compareYOffset + y) * compareWidth;
          const dstOffset = x + y * dstWidth;

          if (baseData[baseOffset] === PIXEL_BLACK) {
            dst[dstOffset] = PIXEL_WHITE;
          } else {
            dst[dstOffset] = compareData[compareOffset] as int;
          }
        }
      }
      break;
    }

    default:
      throw new Error(`unsupported number of channels: ${baseChannelCount}`);
  }

  return createImageData(dst, dstWidth, dstHeight);
}
