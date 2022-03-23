import { convertToGrayscale } from '../../images';
import * as ovalTemplate from './oval.png';
import * as ovalScanTemplate from './oval_scan.png';

/**
 * Returns a grayscale oval template image.
 */
export async function getOvalTemplate(): Promise<ImageData> {
  return convertToGrayscale(await ovalTemplate.asImageData());
}

/**
 * Returns a grayscale scanned oval template image.
 */
export async function getOvalScanTemplate(): Promise<ImageData> {
  return convertToGrayscale(await ovalScanTemplate.asImageData());
}
