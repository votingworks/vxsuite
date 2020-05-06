import { strict as assert } from 'assert'
import { createImageData, ImageData } from 'canvas'
import { matrix_t, U8C1_t, U8C4_t } from 'jsfeat'
import {
  assertGrayscaleImage,
  assertRGBAOrGrayscaleImage,
  isRGBA,
  makeImageTransform,
} from './imageFormatUtils'

/**
 * Converts an image to an RGBA image.
 */
export const toRGBA = makeImageTransform(grayToRGBA, (imageData) =>
  imageData instanceof ImageData
    ? imageData
    : createImageData(imageData.data, imageData.width, imageData.height)
)

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

/**
 * Convert an image data to a jsfeat matrix. This operations preserves the
 * number and content of all channels.
 */
export function toMatrix(imageData: ImageData): matrix_t {
  assertRGBAOrGrayscaleImage(imageData)
  const { data, width, height } = imageData
  const mat = new matrix_t(width, height, isRGBA(imageData) ? U8C4_t : U8C1_t)

  assert.equal(mat.data.length, imageData.data.length)
  mat.data.set(data)

  return mat
}

/**
 * Convert a jsfeat matrix to an image data. This operation preserves the
 * number and content of all channels.
 */
export function fromMatrix(mat: matrix_t): ImageData {
  const data = new Uint8ClampedArray(mat.cols * mat.rows * mat.channel)
  const imageData = createImageData(data, mat.cols, mat.rows)

  if (mat.channel === 4) {
    const data_u32 = new Uint32Array(imageData.data.buffer)
    const alpha = 0xff << 24
    let i = mat.cols * mat.rows
    let pix = 0

    while (--i >= 0) {
      pix = mat.data[i]
      data_u32[i] = alpha | (pix << 16) | (pix << 8) | pix
    }
  } else if (mat.channel === 1) {
    data.set(mat.data)
  } else {
    throw new Error(
      'expected matrix to be 1-channel grayscale or 4-channel RGBA'
    )
  }

  return imageData
}
