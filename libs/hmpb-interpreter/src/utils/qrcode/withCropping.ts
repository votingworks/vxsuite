import { DetectQRCode, DetectQRCodeResult } from '../../types'
import crop from '../crop'
import { flipRectVH } from '../geometry'

/**
 * Makes a new QR code detector from an existing one that works by cropping the
 * bottom-right and top-left corners of the image before passing it on.
 */
export function withCropping(
  decode: DetectQRCode,
  { widthFraction = 1 / 4, heightFraction = 1 / 5 } = {}
): DetectQRCode {
  return async (imageData): Promise<DetectQRCodeResult | undefined> => {
    const width = Math.floor(imageData.width * widthFraction)
    const height = Math.floor(imageData.height * heightFraction)
    const searchBounds = {
      x: imageData.width - width,
      y: imageData.height - height,
      width,
      height,
    }

    {
      const cropped = crop(imageData, searchBounds)
      const decoded = await decode(cropped)

      if (decoded) {
        return {
          data: decoded.data,
          rightSideUp: decoded.rightSideUp ?? true,
        }
      }
    }

    {
      const cropped = crop(
        imageData,
        flipRectVH(
          { x: 0, y: 0, width: imageData.width, height: imageData.height },
          searchBounds
        )
      )
      const decoded = await decode(cropped)

      if (decoded) {
        return {
          data: decoded.data,
          rightSideUp: decoded.rightSideUp ?? false,
        }
      }
    }

    return undefined
  }
}
