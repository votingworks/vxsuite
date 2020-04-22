import { createImageData } from 'canvas'

/**
 * Flips an image vertically and horizontally, equivalent to a 180° rotation.
 *
 * @param imageData a 4-channel RGBA image
 */
export function vh(imageData: ImageData): ImageData {
  const result = createImageData(imageData.width, imageData.height)
  const { data, width, height } = imageData
  const { data: rdata } = result

  for (let y = 0; y < height; y += 1) {
    const ry = height - y - 1

    for (let x = 0; x < width; x += 1) {
      const rx = width - x - 1
      const px = (x + y * width) << 2
      const rpx = (rx + ry * width) << 2

      rdata[rpx] = data[px]
      rdata[rpx + 1] = data[px + 1]
      rdata[rpx + 2] = data[px + 2]
      rdata[rpx + 3] = data[px + 3]
    }
  }

  return result
}
