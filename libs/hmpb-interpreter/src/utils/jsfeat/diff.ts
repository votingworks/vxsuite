import { matrix_t, U8C1_t } from 'jsfeat'
import { Rect } from '../../types'

export function diffGrayscaleImages(
  base: matrix_t,
  current: matrix_t,
  baseBounds: Rect,
  currentBounds: Rect
): matrix_t {
  if (
    baseBounds.width !== currentBounds.width ||
    baseBounds.height !== currentBounds.height
  ) {
    throw new Error(
      `Cannot diff image areas that are not the same size (${baseBounds.width}, ${baseBounds.height}) != (${currentBounds.width}, ${currentBounds.height}).`
    )
  }

  if (base.channel !== current.channel) {
    throw new Error(
      `Cannot diff images with mismatched channels (${base.channel} != ${current.channel}).`
    )
  }

  if (base.data.length !== base.cols * base.rows) {
    throw new Error(
      `Expected base image to be 8-bit pixel grayscale, but got ${
        ((base.cols * base.rows) / base.data.length) * 8
      }-bit.`
    )
  }

  if (current.data.length !== current.cols * base.rows) {
    throw new Error(
      `Expected current image to be 8-bit pixel grayscale, but got ${
        ((current.cols * current.rows) / current.data.length) * 8
      }-bit.`
    )
  }

  const { width, height } = baseBounds
  const diff = new matrix_t(width, height, U8C1_t)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const currentPix =
        current.data[currentBounds.x + x + (currentBounds.y + y) * current.cols]
      const basePix =
        base.data[baseBounds.x + x + (baseBounds.y + y) * base.cols]
      const d = Math.abs(currentPix - basePix)
      diff.data[x + y * width] = d
    }
  }

  return diff
}

export function diffImagesScore(
  base: matrix_t,
  current: matrix_t,
  baseBounds: Rect,
  currentBounds: Rect
): number {
  const diff = diffGrayscaleImages(base, current, baseBounds, currentBounds)
  return (
    [...diff.data].reduce((sum, value) => sum + (value > 127 ? 1 : 0), 0) /
    (baseBounds.width * baseBounds.height)
  )
}
