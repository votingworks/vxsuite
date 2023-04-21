import * as ovalTemplate from './oval.png';

/**
 * Returns an oval template image.
 */
export async function getOvalTemplate(): Promise<ImageData> {
  return await ovalTemplate.asImageData();
}
