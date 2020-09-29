import { Rect } from '../types'
import { createImageData } from './canvas'

/**
 * Returns a new image cropped to the specified bounds.
 */
export default function crop(
  { data: src, width: srcWidth, height: srcHeight }: ImageData,
  bounds: Rect
): ImageData {
  const channels = src.length / (srcWidth * srcHeight)
  const dst = new Uint8ClampedArray(bounds.width * bounds.height * channels)
  const {
    x: srcXOffset,
    y: srcYOffset,
    width: dstWidth,
    height: dstHeight,
  } = bounds

  for (let y = 0; y < dstHeight; y += 1) {
    const srcOffset = (srcYOffset + y) * srcWidth + srcXOffset
    const dstOffset = y * dstWidth
    dst.set(
      src.subarray(srcOffset * channels, (srcOffset + dstWidth) * channels),
      dstOffset * channels
    )
  }

  return createImageData(dst, dstWidth, dstHeight)
}
