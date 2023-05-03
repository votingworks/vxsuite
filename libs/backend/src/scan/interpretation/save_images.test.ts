import {
  createImageData,
  loadImageData,
  toGrayscale,
  writeImageData,
} from '@votingworks/image-utils';
import { readFileSync } from 'fs-extra';
import { join } from 'path';
import { tmpDir, tmpFileWithData } from '../../../test/helpers/tmp';
import { saveImages, saveSheetImages } from './save_images';

test('saveImages without normalized image', async () => {
  const imagePath = tmpFileWithData('image');
  const originalImagePath = tmpFileWithData('original image');
  const normalizedImagePath = tmpFileWithData('normalized image');

  const { original, normalized } = await saveImages(
    imagePath,
    originalImagePath,
    normalizedImagePath
  );

  expect(original).toEqual(originalImagePath);
  expect(normalized).toEqual(originalImagePath);

  // has the new data
  expect(readFileSync(originalImagePath, 'utf8')).toEqual('image');

  // unchanged
  expect(readFileSync(normalizedImagePath, 'utf8')).toEqual('normalized image');
});

test('saveImages with normalized image', async () => {
  const imagePath = tmpFileWithData('image');
  const originalImagePath = tmpFileWithData('original image');
  const normalizedImagePath = tmpFileWithData('normalized image');

  const { original, normalized } = await saveImages(
    imagePath,
    originalImagePath,
    normalizedImagePath,
    createImageData(1, 1)
  );

  expect(original).toEqual(originalImagePath);
  expect(normalized).toEqual(normalizedImagePath);

  expect(readFileSync(originalImagePath, 'utf8')).toEqual('image');

  // has the image data
  expect(toGrayscale(await loadImageData(normalizedImagePath))).toEqual(
    toGrayscale(createImageData(1, 1))
  );
});

test.each([['.jpg'], ['.png']])(
  'saveSheetImages: %s extension',
  async (ext) => {
    const sheetId = 'sheetId';
    const scannedImagesPath = tmpDir();
    const ballotImagesPath = tmpDir();
    const ballotImagePath = join(scannedImagesPath, `ballot-image${ext}`);
    const normalizedImage = createImageData(1, 1);

    await writeImageData(ballotImagePath, normalizedImage);

    const { original, normalized } = await saveSheetImages(
      sheetId,
      ballotImagesPath,
      ballotImagePath,
      normalizedImage
    );

    expect(original).toEqual(
      join(ballotImagesPath, `ballot-image-sheetId-original${ext}`)
    );
    expect(normalized).toEqual(
      join(ballotImagesPath, `ballot-image-sheetId-normalized${ext}`)
    );

    expect(toGrayscale(await loadImageData(original))).toEqual(
      toGrayscale(normalizedImage)
    );
    expect(toGrayscale(await loadImageData(normalized))).toEqual(
      toGrayscale(normalizedImage)
    );
  }
);
