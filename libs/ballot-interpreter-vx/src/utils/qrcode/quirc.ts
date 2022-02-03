import makeDebug from 'debug';
import { DetectQrCodeResult } from '../../types';
import { withCropping } from './with_cropping';

const debug = makeDebug('ballot-interpreter-vx:quirc');

/**
 * Uses quirc to detect QR codes in a ballot image.
 */
export async function detect(
  imageData: ImageData
): Promise<DetectQrCodeResult | undefined> {
  debug('detecting QR code in %d×%d image', imageData.width, imageData.height);

  const quirc = await import('node-quirc');
  const result = await quirc.decode(imageData);

  for (const symbol of result) {
    if (!('err' in symbol)) {
      debug('found QR code with data: %o', symbol.data);
      return { data: symbol.data };
    }
  }

  return undefined;
}

export const quirc = withCropping(detect);
