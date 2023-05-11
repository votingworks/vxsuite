import { writeImageData } from '@votingworks/image-utils';
import { Side } from '@votingworks/types';
import makeDebug from 'debug';
import * as fsExtra from 'fs-extra';
import { join, parse } from 'path';

const debug = makeDebug('backend:scan:save_images');

/**
 * Links {@link src} to {@link dest} if both paths are on the same file system,
 * otherwise does a file copy.
 */
async function linkOrCopy(src: string, dest: string): Promise<void> {
  try {
    await fsExtra.link(src, dest);
  } catch {
    await fsExtra.copy(src, dest);
  }
}

/**
 * Saves the image for a ballot in the ballot images directory.
 */
export async function saveImage({
  sourceImagePath,
  destinationImagePath,
  normalizedImage,
}: {
  sourceImagePath: string;
  destinationImagePath: string;
  normalizedImage?: ImageData;
}): Promise<void> {
  if (normalizedImage) {
    debug('about to write normalized ballot image to %s', destinationImagePath);
    await writeImageData(destinationImagePath, normalizedImage);
    debug('wrote normalized ballot image to %s', destinationImagePath);
  } else {
    debug('using the original ballot image at %s', sourceImagePath);
    await linkOrCopy(sourceImagePath, destinationImagePath);
  }
}

/**
 * Stores the image for a ballot in the ballot images directory.
 */
export async function saveSheetImage({
  sheetId,
  side,
  ballotImagesPath,
  sourceImagePath,
  normalizedImage,
}: {
  sheetId: string;
  side: Side;
  ballotImagesPath: string;
  sourceImagePath: string;
  normalizedImage?: ImageData;
}): Promise<string> {
  const parts = parse(sourceImagePath);
  const ext = parts.ext === '.png' ? '.png' : '.jpg';
  const destinationImagePath = join(
    ballotImagesPath,
    `${sheetId}-${side}${ext}`
  );
  await saveImage({
    sourceImagePath,
    destinationImagePath,
    normalizedImage,
  });
  return destinationImagePath;
}
