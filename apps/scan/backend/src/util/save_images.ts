import { writeImageData } from '@votingworks/image-utils';
import * as fsExtra from 'fs-extra';
import { basename, join, parse } from 'path';
import { rootDebug } from './debug';

const debug = rootDebug.extend('save-images');

interface SaveImagesResult {
  original: string;
  normalized: string;
}

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

export async function saveImages(
  imagePath: string,
  originalImagePath: string,
  normalizedImagePath: string,
  normalizedImage?: ImageData
): Promise<SaveImagesResult> {
  if (imagePath !== originalImagePath) {
    debug('linking image file %s from %s', imagePath, originalImagePath);
    await linkOrCopy(imagePath, originalImagePath);
  }

  if (normalizedImage) {
    debug('about to write normalized ballot image to %s', normalizedImagePath);
    await writeImageData(normalizedImagePath, normalizedImage);
    debug('wrote normalized ballot image to %s', normalizedImagePath);
    return { original: originalImagePath, normalized: normalizedImagePath };
  }

  return { original: originalImagePath, normalized: originalImagePath };
}

/**
 * Stores the images for a ballot in the ballot images directory.
 *
 * @param sheetId the database id of the sheet
 * @param ballotImagesPath the location where the ballot images are stored
 * @param ballotImagePath the location of the original scanned ballot image
 * @param normalizedImage the normalized ballot image, if any
 * @returns the locations of the original and normalized ballot images
 */
export async function saveSheetImages(
  sheetId: string,
  ballotImagesPath: string,
  ballotImagePath: string,
  normalizedImage?: ImageData
): Promise<SaveImagesResult> {
  const parts = parse(ballotImagePath);
  const ext = parts.ext === '.png' ? '.png' : '.jpg';
  const originalImagePath = join(
    ballotImagesPath,
    `${basename(ballotImagePath, ext)}-${sheetId}-original${ext}`
  );
  const normalizedImagePath = join(
    ballotImagesPath,
    `${basename(ballotImagePath, ext)}-${sheetId}-normalized${ext}`
  );
  return await saveImages(
    ballotImagePath,
    originalImagePath,
    normalizedImagePath,
    normalizedImage
  );
}
