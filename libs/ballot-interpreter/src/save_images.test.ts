import { expect, test } from 'vitest';
import { createImageData } from '@votingworks/image-utils';
import { RgbaImageData, SheetOf } from '@votingworks/types';
import { join } from 'node:path';
import { tmpDir } from '../test/helpers/tmp.js';
import { saveSheetImages } from './save_images.js';

test('saveSheetImages', async () => {
  const sheetId = 'sheetId';
  const ballotImagesPath = tmpDir();
  const images: SheetOf<RgbaImageData> = [
    createImageData(1, 1),
    createImageData(1, 1),
  ];

  const destinationImagePaths = await saveSheetImages({
    sheetId,
    ballotImagesPath,
    images,
  });

  expect(destinationImagePaths).toEqual([
    join(ballotImagesPath, `sheetId-front.png`),
    join(ballotImagesPath, `sheetId-back.png`),
  ]);
});
