import { GrayImage, wrapImageData } from '@votingworks/image-utils';
import * as ovalTemplate from './oval.png';
import * as ovalScanTemplate from './oval_scan.png';

/**
 * Returns an oval template image.
 */
export async function getOvalTemplate(): Promise<GrayImage> {
  return wrapImageData(await ovalTemplate.asImageData()).toGray();
}

/**
 * Returns a scanned oval template image.
 */
export async function getOvalScanTemplate(): Promise<GrayImage> {
  return wrapImageData(await ovalScanTemplate.asImageData()).toGray();
}
