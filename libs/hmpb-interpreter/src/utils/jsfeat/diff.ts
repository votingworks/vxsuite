import { Rect } from '../../types'
import { PIXEL_BLACK, PIXEL_WHITE } from '../binarize'
import {
  assertImageChannelsMatch,
  assertSizesMatch,
  getImageChannelCount,
  isRGBA,
} from '../imageFormatUtils'

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
export default function diff(
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
  assertImageChannelsMatch(base, compare)
  assertSizesMatch(baseBounds, compareBounds)

  const { data: baseData, width: baseWidth } = base
  const { data: compareData, width: compareWidth } = compare
  const { x: baseXOffset, y: baseYOffset } = baseBounds
  const { x: compareXOffset, y: compareYOffset } = compareBounds
  const { width: dstWidth, height: dstHeight } = baseBounds
  let dst: Uint8ClampedArray

  if (isRGBA(base)) {
    dst = new Uint8ClampedArray(dstWidth * dstHeight * 4)

    for (let y = 0; y < dstHeight; y += 1) {
      for (let x = 0; x < dstWidth; x += 1) {
        const baseOffset =
          (baseXOffset + x + (baseYOffset + y) * baseWidth) << 2
        const compareOffset =
          (compareXOffset + x + (compareYOffset + y) * compareWidth) << 2
        const dstOffset = (x + y * dstWidth) << 2

        if (
          baseData[baseOffset] === PIXEL_BLACK &&
          baseData[baseOffset + 1] === PIXEL_BLACK &&
          baseData[baseOffset + 2] === PIXEL_BLACK
        ) {
          dst[dstOffset] = PIXEL_WHITE
          dst[dstOffset + 1] = PIXEL_WHITE
          dst[dstOffset + 2] = PIXEL_WHITE
        } else {
          dst[dstOffset] = compareData[compareOffset]
          dst[dstOffset + 1] = compareData[compareOffset + 1]
          dst[dstOffset + 2] = compareData[compareOffset + 2]
        }
        dst[dstOffset + 3] = 0xff
      }
    }
  } else {
    dst = new Uint8ClampedArray(dstWidth * dstHeight)

    for (let y = 0; y < dstHeight; y += 1) {
      for (let x = 0; x < dstWidth; x += 1) {
        const baseOffset = baseXOffset + x + (baseYOffset + y) * baseWidth
        const compareOffset =
          compareXOffset + x + (compareYOffset + y) * compareWidth
        const dstOffset = x + y * dstWidth

        if (baseData[baseOffset] === PIXEL_BLACK) {
          dst[dstOffset] = PIXEL_WHITE
        } else {
          dst[dstOffset] = compareData[compareOffset]
        }
      }
    }
  }

  return {
    data: dst,
    width: dstWidth,
    height: dstHeight,
  }
}

export interface CountOptions {
  color?: number
  bounds?: Rect
}

/**
 * Determines the ratio of black (or custom color) pixels in an image to the
 * total number of pixels.
 */
export function ratio(image: ImageData, options: CountOptions = {}): number {
  const { width, height } = image
  return countPixels(image, options) / (width * height)
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
): number {
  const { data } = image
  const channels = getImageChannelCount(image)
  const { x: startX, y: startY, width, height } = bounds
  let count = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[((startY + y) * width + startX + x) * channels] === color) {
        count += 1
      }
    }
  }

  return count
}
