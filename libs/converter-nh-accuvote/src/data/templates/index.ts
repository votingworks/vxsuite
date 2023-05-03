import * as ovalTemplate from './oval.png';
import * as ovalScanTemplate from './oval_scan.png';

/**
 * Returns an oval template image.
 */
export async function getOvalTemplate(): Promise<ImageData> {
  return await ovalTemplate.asImageData();
}

/**
 * Returns a scanned oval template image.
 */
export async function getOvalScanTemplate(): Promise<ImageData> {
  return await ovalScanTemplate.asImageData();
}
