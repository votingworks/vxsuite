import { createImageData, writeImageData } from '@votingworks/image-utils';
import { join } from 'path';
import { tmpDir } from '../test/helpers/tmp';
import { saveSheetImage } from './save_images';

test.each([
  ['.jpg', 'front'],
  ['.jpg', 'back'],
  ['.png', 'front'],
  ['.png', 'back'],
] as const)('saveSheetImages: %s extension', async (ext, side) => {
  const sheetId = 'sheetId';
  const scannedImagesPath = tmpDir();
  const ballotImagesPath = tmpDir();
  const sourceImagePath = join(scannedImagesPath, `ballot-image${ext}`);
  const normalizedImage = createImageData(1, 1);

  await writeImageData(sourceImagePath, normalizedImage);

  const destinationImagePath = await saveSheetImage({
    sheetId,
    side,
    ballotImagesPath,
    sourceImagePath,
    normalizedImage,
  });

  expect(destinationImagePath).toEqual(
    join(ballotImagesPath, `sheetId-${side}${ext}`)
  );
});
