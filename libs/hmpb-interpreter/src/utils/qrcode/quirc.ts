import makeDebug from 'debug'
import sharp, { Channels } from 'sharp'
import { DetectQRCodeResult } from '../../types'
import { withCropping } from './withCropping'

const debug = makeDebug('hmpb-interpreter:quirc')

/**
 * Encodes an image as a PNG.
 */
async function toPNGData(imageData: ImageData): Promise<Buffer> {
  return await sharp(Buffer.from(imageData.data.buffer), {
    raw: {
      width: imageData.width,
      height: imageData.height,
      channels: (imageData.data.length /
        imageData.width /
        imageData.height) as Channels,
    },
  })
    .png()
    .toBuffer()
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
  const quirc = await import('node-quirc')
  const result = await quirc.decode(await toPNGData(imageData))

  for (const symbol of result) {
    if (!('err' in symbol)) {
      debug('found QR code with data: %o', symbol.data)
      return { data: symbol.data }
    }
  }
}

export default withCropping(detect)
