import { createCanvas } from 'canvas'
import makeDebug from 'debug'
import * as quirc from 'node-quirc'
import { DetectQRCodeResult } from '../../types'
import { withCropping } from './withCropping'

const debug = makeDebug('hmpb-interpreter:quirc')

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
  debug('detecting QR code in %d×%d image', imageData.width, imageData.height)

  // Unfortunately, quirc requires either JPEG or PNG encoded images and can't
  // handle raw bitmaps.
  const result = await quirc.decode(toPNGData(imageData))

  for (const symbol of result) {
    if (!('err' in symbol)) {
      debug('found QR code with data: %o', symbol.data)
      return { data: symbol.data }
    }
  }
}

export default withCropping(detect)
