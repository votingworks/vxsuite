import { test } from 'vitest';
import { assert } from '@votingworks/basics';
import { sampleBallotImages } from '@votingworks/fixtures';
import { ImageData } from 'canvas';
import { rotateImageData180 } from './rotate.js';

test('can rotate real life ImageData as expected', async () => {
  const rotatedImageData = await sampleBallotImages.notBallot.asImageData();
  const sampleImageData = await sampleBallotImages.notBallot.asImageData();
  rotateImageData180(rotatedImageData);
  // Rotated ImageData should be different then the original
  assert(
    !rotatedImageData.data.every(
      (value, idx) => value === sampleImageData.data[idx]
    )
  );
  // Rotating the image again should return to the original
  rotateImageData180(rotatedImageData);
  assert(
    rotatedImageData.data.every(
      (value, idx) => value === sampleImageData.data[idx]
    )
  );
});

test('can rotate simple ImageData as expected', () => {
  const sampleImageData = new ImageData(2, 2);
  // Make the first pixel red
  sampleImageData.data[0] = 255;
  sampleImageData.data[1] = 0;
  sampleImageData.data[2] = 0;
  sampleImageData.data[3] = 255;

  const expectedRotatedImageData = new ImageData(2, 2);
  // After a 180 degree rotation the first pixel should be the bottom right pixel
  // which corresponds to the data indexes beginning at 3*4 = 12
  expectedRotatedImageData.data[12] = 255;
  expectedRotatedImageData.data[13] = 0;
  expectedRotatedImageData.data[14] = 0;
  expectedRotatedImageData.data[15] = 255;

  rotateImageData180(sampleImageData);
  assert(
    sampleImageData.data.every(
      (value, idx) => value === expectedRotatedImageData.data[idx]
    )
  );
});
