import {
  assertGrayscaleImage,
  assertRGBAImage,
  assertSizesMatch,
  makeInPlaceImageTransform,
} from './makeImageTransform'

/**
 * Flips an image vertically and horizontally, equivalent to a 180° rotation.
 */
export const vh = makeInPlaceImageTransform(vhGray, vhRGBA)

export function vhRGBA(
  srcImageData: ImageData,
  dstImageData = srcImageData
): void {
  assertRGBAImage(srcImageData)
  assertRGBAImage(dstImageData)
  assertSizesMatch(srcImageData, dstImageData)

  const { data: src } = srcImageData
  const { data: dst } = dstImageData
  const size = src.length

  if (src === dst) {
    // In-place flip means we need to be careful not to overwrite data before
    // reading it. We can do that by working from the ends toward the middle and
    // swapping the pixels as we find them.
    const data = src

    for (let left = 0, right = size - 4; left < right; left += 4, right -= 4) {
      ;[
        data[left],
        data[left + 1],
        data[left + 2],
        data[left + 3],
        data[right],
        data[right + 1],
        data[right + 2],
        data[right + 3],
      ] = [
        data[right],
        data[right + 1],
        data[right + 2],
        data[right + 3],
        data[left],
        data[left + 1],
        data[left + 2],
        data[left + 3],
      ]
    }
  } else {
    // Flipping from one image to another, we read `src` in reverse and put it
    // one pixel at a time into `dst`.
    for (
      let dstOffset = 0, srcOffset = size - 4;
      dstOffset < size;
      dstOffset += 4, srcOffset -= 4
    ) {
      dst[dstOffset] = src[srcOffset]
      dst[dstOffset + 1] = src[srcOffset + 1]
      dst[dstOffset + 2] = src[srcOffset + 2]
      dst[dstOffset + 3] = src[srcOffset + 3]
    }
  }
}

export function vhGray(
  srcImageData: ImageData,
  dstImageData = srcImageData
): void {
  assertGrayscaleImage(srcImageData)
  assertGrayscaleImage(dstImageData)
  assertSizesMatch(srcImageData, dstImageData)

  const { data: src } = srcImageData
  const { data: dst } = dstImageData
  const size = src.length

  if (src === dst) {
    // In-place flip means we need to be careful not to overwrite data before
    // reading it. We can do that by working from the ends toward the middle and
    // swapping the pixels as we find them.
    const data = src

    for (let left = 0, right = size - 1; left < right; left += 1, right -= 1) {
      ;[data[left], data[right]] = [data[right], data[left]]
    }
  } else {
    // Flipping from one image to another, we read `src` in reverse and put it
    // one pixel at a time into `dst`.
    for (
      let dstOffset = 0, srcOffset = size - 1;
      dstOffset < size;
      dstOffset += 1, srcOffset -= 1
    ) {
      dst[dstOffset] = src[srcOffset]
    }
  }
}
