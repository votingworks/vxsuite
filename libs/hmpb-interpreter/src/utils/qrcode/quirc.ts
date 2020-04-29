import { createCanvas } from 'canvas'
import * as quirc from 'node-quirc'
import { withCropping } from './withCropping'
import { DetectQRCodeResult } from '../../types'

const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'

/**
 * Encodes an image as a PNG.
 */
function toPNGData(imageData: ImageData): Buffer {
  const canvas = createCanvas(imageData.width, imageData.height)
  const context = canvas.getContext('2d')

  context.putImageData(imageData, 0, 0)

  const dataURL = canvas.toDataURL('image/png')

  if (!dataURL.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new Error(`PNG data URL has unexpected format: ${dataURL}`)
  }

  return Buffer.from(dataURL.slice(PNG_DATA_URL_PREFIX.length), 'base64')
}

/**
 * Uses quirc to detect QR codes in a ballot image.
 */
export async function detect(
  imageData: ImageData
): Promise<DetectQRCodeResult | undefined> {
  // Unfortunately, quirc requires either JPEG or PNG encoded images and can't
  // handle raw bitmaps.
  const result = await quirc.decode(toPNGData(imageData))

  if (result.length !== 1) {
    return
  }

  return { data: result[0].data }
}

export default withCropping(detect)
