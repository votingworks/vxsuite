import { DetectQRCodeResult } from '../../types'
import jsqr from './jsqr'
import quirc from './quirc'

export { jsqr, quirc }

/**
 * Detects QR codes in a ballot image.
 */
export default async function detect(
  imageData: ImageData
): Promise<DetectQRCodeResult | undefined> {
  return (await quirc(imageData)) ?? (await jsqr(imageData))
}
