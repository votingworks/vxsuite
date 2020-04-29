import jsQR from 'jsqr'
import { DetectQRCodeResult } from '../../types'
import { withCropping } from './withCropping'

/**
 * Uses jsQR to detect QR codes in a ballot image.
 */
export async function detect(
  imageData: ImageData
): Promise<DetectQRCodeResult | undefined> {
  const { data, width, height } = imageData
  const qrcode = jsQR(data, width, height)

  if (!qrcode) {
    return
  }

  const qrdata = Buffer.from(qrcode.binaryData)
  const rightSideUp =
    qrcode.location.bottomRightCorner.x > qrcode.location.topLeftCorner.x

  return {
    data: qrdata,
    rightSideUp,
  }
}

export default withCropping(detect)
