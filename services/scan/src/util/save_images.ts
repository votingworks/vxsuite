import makeDebug from 'debug';
import * as fsExtra from 'fs-extra';
import { writeImageData } from './images';

const debug = makeDebug('scan:importer');

export async function saveImages(
  imagePath: string,
  originalImagePath: string,
  normalizedImagePath: string,
  normalizedImage?: ImageData
): Promise<{
  original: string;
  normalized: string;
}> {
  if (imagePath !== originalImagePath) {
    debug('linking image file %s from %s', imagePath, originalImagePath);
    await fsExtra.link(imagePath, originalImagePath);
  }

  if (normalizedImage) {
    debug('about to write normalized ballot image to %s', normalizedImagePath);
    await writeImageData(normalizedImagePath, normalizedImage);
    debug('wrote normalized ballot image to %s', normalizedImagePath);
    return { original: originalImagePath, normalized: normalizedImagePath };
  }

  return { original: originalImagePath, normalized: originalImagePath };
}
