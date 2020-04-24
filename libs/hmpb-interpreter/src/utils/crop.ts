import { createImageData } from 'canvas'
import { Rect } from '../types'
import { makeImageTransform } from './makeImageTransform'

/**
 * Returns a new image cropped to the specified bounds.
 */
export default makeImageTransform(gray, rgba)

/**
 * Returns a new grayscale image cropped to the specified bounds.
 */
export function gray(
  { data: src, width: srcWidth }: ImageData,
  bounds: Rect
): ImageData {
  const dst = new Uint8ClampedArray(bounds.width * bounds.height)
  const {
    x: srcXOffset,
    y: srcYOffset,
    width: dstWidth,
    height: dstHeight,
  } = bounds

  for (let y = 0; y < dstHeight; y += 1) {
    const srcY = srcYOffset + y

    for (let x = 0; x < dstWidth; x += 1) {
      const srcX = srcXOffset + x
      const srcOffset = srcX + srcY * srcWidth
      const dstOffset = x + y * dstWidth

      dst[dstOffset] = src[srcOffset]
    }
  }

  return { data: dst, width: dstWidth, height: dstHeight }
}

/**
 * Returns a new RGBA image cropped to the specified bounds.
 */
export function rgba(
  { data: src, width: srcWidth }: ImageData,
  bounds: Rect
): ImageData {
  const dst = new Uint8ClampedArray(bounds.width * bounds.height * 4)
  const {
    x: srcXOffset,
    y: srcYOffset,
    width: dstWidth,
    height: dstHeight,
  } = bounds

  for (let y = 0; y < dstHeight; y += 1) {
    const srcY = srcYOffset + y

    for (let x = 0; x < dstWidth; x += 1) {
      const srcX = srcXOffset + x
      const srcOffset = (srcX + srcY * srcWidth) << 2
      const dstOffset = (x + y * dstWidth) << 2

      dst[dstOffset] = src[srcOffset]
      dst[dstOffset + 1] = src[srcOffset + 1]
      dst[dstOffset + 2] = src[srcOffset + 2]
      dst[dstOffset + 3] = src[srcOffset + 3]
    }
  }

  return createImageData(dst, dstWidth, dstHeight)
}
