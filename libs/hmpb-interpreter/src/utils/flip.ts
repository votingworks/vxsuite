import { createImageData } from 'canvas'
import { makeImageTransform } from './makeImageTransform'

/**
 * Flips an image vertically and horizontally, equivalent to a 180° rotation.
 */
export const vh = makeImageTransform(vhGray, vhRGBA)

export function vhRGBA({ data: src, width, height }: ImageData): ImageData {
  const dst = new Uint8ClampedArray(src.length)
  const result = createImageData(dst, width, height)

  for (let y = 0; y < height; y += 1) {
    const dstY = height - y - 1

    for (let x = 0; x < width; x += 1) {
      const dstX = width - x - 1
      const srcOffset = (x + y * width) << 2
      const dstOffset = (dstX + dstY * width) << 2

      dst[dstOffset] = src[srcOffset]
      dst[dstOffset + 1] = src[srcOffset + 1]
      dst[dstOffset + 2] = src[srcOffset + 2]
      dst[dstOffset + 3] = src[srcOffset + 3]
    }
  }

  return result
}

export function vhGray({ data: src, width, height }: ImageData): ImageData {
  const dst = new Uint8ClampedArray(src.length)
  const result = createImageData(dst, width, height)

  for (let y = 0; y < height; y += 1) {
    const dstY = height - y - 1

    for (let x = 0; x < width; x += 1) {
      const dstX = width - x - 1

      dst[dstX + dstY * width] = src[x + y * width]
    }
  }

  return result
}
