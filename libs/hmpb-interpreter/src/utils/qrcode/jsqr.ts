import makeDebug from 'debug'
import jsQR from 'jsqr'
import { DetectQRCodeResult } from '../../types'
import { withCropping } from './withCropping'

const debug = makeDebug('hmpb-interpreter:jsqr')

/**
 * Uses jsQR to detect QR codes in a ballot image.
 */
export async function detect(
  imageData: ImageData
): Promise<DetectQRCodeResult | undefined> {
  debug('detecting QR code in %d×%d image', imageData.width, imageData.height)

  const { data, width, height } = imageData
  const qrcode = jsQR(data, width, height)

  if (!qrcode) {
    return undefined
  }

  const qrdata = Buffer.from(qrcode.binaryData)
  const rightSideUp =
    qrcode.location.bottomRightCorner.x > qrcode.location.topLeftCorner.x

  return {
    rightSideUp,
    data: qrdata,
  }
}

export default withCropping(detect)
