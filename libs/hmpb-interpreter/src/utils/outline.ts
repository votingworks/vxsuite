import { PIXEL_BLACK } from './binarize'
import { createImageData } from './canvas'
import { getImageChannelCount } from './imageFormatUtils'

/**
 * Outline pixels of a certain color with the same color.
 */
export default function outline(
  { data: src, width, height }: ImageData,
  { color = PIXEL_BLACK } = {}
): ImageData {
  const channels = getImageChannelCount({ data: src, width, height })
  const result = createImageData(width, height)
  const v1px = width * channels
  const h1px = channels
  const pixel = channels === 4 ? [color, color, color, 0xff] : [color]
  const { data: dst } = result

  dst.set(src)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels

      if (src[offset] === color) {
        if (y > 0) {
          dst.set(pixel, offset - v1px)
        }
        if (y < height - 1) {
          dst.set(pixel, offset + v1px)
        }
        if (x > 0) {
          dst.set(pixel, offset - h1px)
        }
        if (x < width - 1) {
          dst.set(pixel, offset + h1px)
        }
      }
    }
  }

  return result
}
