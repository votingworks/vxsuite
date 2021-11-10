import { DetectQrCodeResult } from '../../types';
import { jsqr } from './jsqr';
import { quirc } from './quirc';

export { jsqr, quirc };

/**
 * Detects QR codes in a ballot image.
 */
export async function detect(
  imageData: ImageData
): Promise<DetectQrCodeResult | undefined> {
  return (await quirc(imageData)) ?? (await jsqr(imageData));
}
