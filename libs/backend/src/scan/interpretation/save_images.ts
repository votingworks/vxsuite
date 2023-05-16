import { writeImageData } from '@votingworks/image-utils';
import { Side } from '@votingworks/types';
import { join, parse } from 'path';

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
  normalizedImage: ImageData;
}): Promise<string> {
  const parts = parse(sourceImagePath);
  const ext = parts.ext === '.png' ? '.png' : '.jpg';
  const destinationImagePath = join(
    ballotImagesPath,
    `${sheetId}-${side}${ext}`
  );
  await writeImageData(destinationImagePath, normalizedImage);
  return destinationImagePath;
}
