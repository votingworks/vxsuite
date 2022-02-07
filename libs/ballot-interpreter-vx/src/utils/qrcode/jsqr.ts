import makeDebug from 'debug';
import jsQr from 'jsqr';
import { DetectQrCodeResult } from '../../types';
import { withCropping } from './with_cropping';

const debug = makeDebug('ballot-interpreter-vx:jsqr');

/**
 * Uses jsQR to detect QR codes in a ballot image.
 */
export async function detect(
  imageData: ImageData
): Promise<DetectQrCodeResult | undefined> {
  debug('detecting QR code in %d×%d image', imageData.width, imageData.height);

  const { data, width, height } = imageData;
  const qrcode = jsQr(data, width, height);

  if (!qrcode) {
    return undefined;
  }

  const qrdata = Buffer.from(qrcode.binaryData);
  const rightSideUp =
    qrcode.location.bottomRightCorner.x > qrcode.location.topLeftCorner.x;

  return {
    data: qrdata,
    rightSideUp,
  };
}

export const jsqr = withCropping(detect);
