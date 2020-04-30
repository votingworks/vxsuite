import { Rect } from '../../types'
import { PIXEL_BLACK, PIXEL_WHITE } from '../binarize'
import {
  assertImageChannelsMatch,
  assertImageSizesMatch,
  getImageChannelCount,
  isRGBA,
} from '../makeImageTransform'

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
  assertImageSizesMatch(base, compare)

  const { data: baseData, width } = base
  const { data: compareData } = compare
  const { x: baseXOffset, y: baseYOffset } = baseBounds
  const { x: compareXOffset, y: compareYOffset } = compareBounds
  const { width: dstWidth, height: dstHeight } = baseBounds
  let dst: Uint8ClampedArray

  if (isRGBA(base)) {
    dst = new Uint8ClampedArray(dstWidth * dstHeight * 4)

    for (let y = 0; y < dstHeight; y += 1) {
      for (let x = 0; x < dstWidth; x += 1) {
        const baseOffset = (baseXOffset + x + (baseYOffset + y) * width) << 2
        const compareOffset =
          (compareXOffset + x + (compareYOffset + y) * width) << 2
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
        const baseOffset = baseXOffset + x + (baseYOffset + y) * width
        const compareOffset = compareXOffset + x + (compareYOffset + y) * width
        const dstOffset = x + y * width

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

/**
 * Determines the ratio of newly-black pixels comparing `base` to `compare` to
 * the total number of pixels.
 *
 * ```
 *      BASE (19×4)           COMPARE (19×4)       RATIO = 14÷(19×4)
 * ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
 * │                   │  │        █ █ ███    │  │        █ █ ███    │
 * │ █ █               │  │ █ █    ███  █     │  │        ███  █     │
 * │  █                │  │  █     █ █ ███    │  │        █ █ ███    │
 * │ █ █ █████████████ │  │ █ █ █████████████ │  │                   │
 * └───────────────────┘  └───────────────────┘  └───────────────────┘
 * ```
 */
export function ratio(
  base: ImageData,
  compare: ImageData,
  baseBounds?: Rect,
  compareBounds?: Rect
): number {
  const diffImage = diff(base, compare, baseBounds, compareBounds)
  const { data, width, height } = diffImage
  const size = data.length
  const channels = getImageChannelCount(base)
  let blackPixelCount = 0

  for (let offset = 0; offset < size; offset += channels) {
    if (data[offset] === PIXEL_BLACK) {
      blackPixelCount += 1
    }
  }

  return blackPixelCount / (width * height)
}
