import grayscale from './grayscale'
import { isRGBA } from './makeImageTransform'
import otsu from './otsu'

export type RGBA = [number, number, number, number]

export const PIXEL_BLACK = 0
export const PIXEL_WHITE = (1 << 8) - 1
export const RGBA_BLACK: RGBA = [PIXEL_BLACK, PIXEL_BLACK, PIXEL_BLACK, 0xff]
export const RGBA_WHITE: RGBA = [PIXEL_WHITE, PIXEL_WHITE, PIXEL_WHITE, 0xff]

/**
 * Converts an image to a grayscale image with all pixels set to either black or
 * white, depending on whether their luminosity is higher or lower than
 * `threshold`. By default an automatic threshold is calculated using Otsu's
 * method.
 *
 * Operates on an image in-place by default, or you may specify a different
 * destination image.
 */
export function binarize(
  srcImageData: ImageData,
  dstImageData = srcImageData,
  { threshold }: { threshold?: number } = {}
): void {
  grayscale(srcImageData, dstImageData)

  const { data: dst, width, height } = dstImageData

  if (typeof threshold === 'undefined') {
    if (isRGBA(dstImageData)) {
      const size = width * height
      const dstGrayData = new Uint8Array(size)
      const rgbaData = dstImageData.data

      for (
        let rgbaOffset = 0, grayOffset = 0;
        grayOffset < size;
        grayOffset += 1, rgbaOffset += 4
      ) {
        dstGrayData[grayOffset] = rgbaData[rgbaOffset]
      }

      threshold = otsu(dstGrayData)
    } else {
      threshold = otsu(dstImageData.data)
    }
  }

  if (isRGBA(dstImageData)) {
    const size = dstImageData.data.length

    for (let offset = 0; offset < size; offset += 4) {
      const pixel = dst[offset] < threshold ? PIXEL_BLACK : PIXEL_WHITE
      dst[offset] = pixel
      dst[offset + 1] = pixel
      dst[offset + 2] = pixel
      dst[offset + 3] = 0xff
    }
  } else {
    const size = dstImageData.data.length

    for (let offset = 0; offset < size; offset += 1) {
      dst[offset] = dst[offset] < threshold ? PIXEL_BLACK : PIXEL_WHITE
    }
  }
}
