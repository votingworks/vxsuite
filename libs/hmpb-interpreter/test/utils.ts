import { strict as assert } from 'assert'
import { randomBytes } from 'crypto'
import { Rect } from '../src/types'
import { createImageData } from '../src/utils/canvas'
import {
  assertGrayscaleImage,
  makeImageTransform,
} from '../src/utils/imageFormatUtils'

export function randomImage({
  width = 0,
  height = 0,
  minWidth = 1,
  maxWidth = 10,
  minHeight = 1,
  maxHeight = 10,
  channels = 4,
} = {}): ImageData {
  if (!width) {
    assert(minWidth <= maxWidth)

    width = Math.max(
      1,
      (minWidth + Math.random() * (maxWidth - minWidth + 1)) | 0
    )
  }
  if (!height) {
    assert(minHeight <= maxHeight)

    height = Math.max(
      1,
      (minHeight + Math.random() * (maxHeight - minHeight + 1)) | 0
    )
  }
  assert(width >= 0)
  assert(height >= 0)
  const data = new Uint8ClampedArray(randomBytes(width * height * channels))
  return createImageData(data, width, height)
}

export function randomInset(
  rect: Rect,
  { min = 0, max = Math.min(rect.width, rect.height) } = {}
): Rect {
  assert(min >= 0)
  assert(max >= min)

  const leftInset =
    Math.max(min, Math.min(max, rect.width / 2 - 1, randomInt(min, max))) | 0
  const rightInset =
    Math.max(min, Math.min(max, rect.width / 2 - 1, randomInt(min, max))) | 0
  const topInset =
    Math.max(min, Math.min(max, rect.height / 2 - 1, randomInt(min, max))) | 0
  const bottomInset =
    Math.max(min, Math.min(max, rect.height / 2 - 1, randomInt(min, max))) | 0

  assert(rect.width - leftInset - rightInset > 0)
  assert(rect.height - topInset - bottomInset > 0)

  return {
    x: rect.x + leftInset,
    y: rect.y + topInset,
    width: rect.width - leftInset - rightInset,
    height: rect.height - topInset - bottomInset,
  }
}

export function randomInt(
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER
): number {
  assert(min <= max)
  return (min + Math.random() * (max - min + 1)) | 0
}

/**
 * Converts an image to an RGBA image.
 */
export const toRGBA = makeImageTransform(grayToRGBA, (imageData) => imageData)

/**
 * Converts a grayscale image to an RGBA image.
 */
export function grayToRGBA(imageData: ImageData): ImageData {
  assertGrayscaleImage(imageData)

  const { data: src, width, height } = imageData
  const dst = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const srcOffset = x + y * width
      const dstOffset = srcOffset << 2

      dst[dstOffset] = src[srcOffset]
      dst[dstOffset + 1] = src[srcOffset]
      dst[dstOffset + 2] = src[srcOffset]
      dst[dstOffset + 3] = 255
    }
  }

  return createImageData(dst, width, height)
}
