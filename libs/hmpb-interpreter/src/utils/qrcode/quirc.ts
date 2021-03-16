import makeDebug from 'debug'
import { DetectQRCodeResult } from '../../types'
import { withCropping } from './withCropping'

const debug = makeDebug('hmpb-interpreter:quirc')

/**
 * Uses quirc to detect QR codes in a ballot image.
 */
export async function detect(
  imageData: ImageData
): Promise<DetectQRCodeResult | undefined> {
  debug('detecting QR code in %d×%d image', imageData.width, imageData.height)

  const quirc = await import('node-quirc')
  const result = await quirc.decode(imageData)

  for (const symbol of result) {
    if (!('err' in symbol)) {
      debug('found QR code with data: %o', symbol.data)
      return { data: symbol.data }
    }
  }

  return undefined
}

export default withCropping(detect)
