import {
  assertGrayscaleImage,
  assertRGBAImage,
  assertSizesMatch,
  isRGBA,
  makeInPlaceImageTransform,
} from './makeImageTransform'

export default makeInPlaceImageTransform(fromGray, fromRGBA)

/**
 * Copies a grayscale image to a destination.
 */
export function fromGray(
  srcImageData: ImageData,
  dstImageData = srcImageData
): void {
  assertGrayscaleImage(srcImageData)
  assertGrayscaleImage(dstImageData)
  assertSizesMatch(srcImageData, dstImageData)

  if (srcImageData === dstImageData) {
    return
  }

  dstImageData.data.set(srcImageData.data)
}

/**
 * Converts an RGBA image to grayscale.
 *
 * Operates on the image in-place by default, or a different destination image
 * may be provided.
 */
export function fromRGBA(
  srcImageData: ImageData,
  dstImageData = srcImageData
): void {
  assertRGBAImage(srcImageData)
  assertSizesMatch(srcImageData, dstImageData)

  const { data: src, width, height } = srcImageData
  const { data: dst } = dstImageData

  if (isRGBA(dstImageData)) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (x + y * width) << 2
        const r = src[offset]
        const g = src[offset + 1]
        const b = src[offset + 2]

        // Luminosity grayscale formula.
        const luminosity = (0.21 * r + 0.72 * g + 0.07 * b) | 0
        dst[offset] = luminosity
        dst[offset + 1] = luminosity
        dst[offset + 2] = luminosity
        dst[offset + 3] = src[offset + 3]
      }
    }
  } else {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dstOffset = x + y * width
        const srcOffset = dstOffset << 2
        const r = src[srcOffset]
        const g = src[srcOffset + 1]
        const b = src[srcOffset + 2]

        // Luminosity grayscale formula.
        dst[dstOffset] = (0.21 * r + 0.72 * g + 0.07 * b) | 0
      }
    }
  }
}
