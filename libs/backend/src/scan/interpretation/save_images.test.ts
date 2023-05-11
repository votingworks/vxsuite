import {
  createImageData,
  loadImageData,
  toGrayscale,
  writeImageData,
} from '@votingworks/image-utils';
import { readFileSync } from 'fs-extra';
import { join } from 'path';
import { tmpDir, tmpFileWithData } from '../../../test/helpers/tmp';
import { saveImage, saveSheetImage } from './save_images';

test('saveImages without normalized image', async () => {
  const destinationImagePath = tmpFileWithData('image');
  const sourceImagePath = tmpFileWithData('source image');

  await saveImage({ sourceImagePath, destinationImagePath });

  // has the new data
  expect(readFileSync(destinationImagePath, 'utf8')).toEqual('source image');

  // unchanged
  expect(readFileSync(sourceImagePath, 'utf8')).toEqual('source image');
});

test('saveImages with normalized image', async () => {
  const destinationImagePath = tmpFileWithData('image');
  const sourceImagePath = tmpFileWithData('source image');

  await saveImage({
    sourceImagePath,
    destinationImagePath,
    normalizedImage: createImageData(1, 1),
  });

  expect(readFileSync(sourceImagePath, 'utf8')).toEqual('source image');

  // has the image data
  expect(toGrayscale(await loadImageData(destinationImagePath))).toEqual(
    toGrayscale(createImageData(1, 1))
  );
});

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

  expect(toGrayscale(await loadImageData(destinationImagePath))).toEqual(
    toGrayscale(normalizedImage)
  );
});
