import { strict as assert } from 'assert'
import { createImageData } from 'canvas'
import { makeImageTransform } from './makeImageTransform'

/**
 * Converts an image to an RGBA image.
 */
export const toRGBA = makeImageTransform(grayToRGBA, (imageData) => imageData)

/**
 * Converts a grayscale image to an RGBA image.
 */
export function grayToRGBA({ data: src, width, height }: ImageData): ImageData {
  assert.equal(src.length, width * height, 'expected a grayscale image')

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
