import { expect, test } from 'vitest';
import { join } from 'node:path';
import { ImageData } from 'canvas';
import { loadImageData, RGBA_CHANNEL_COUNT } from '@votingworks/image-utils';
import {
  runBlankPaperDiagnostic,
  runBlankPaperDiagnosticFromImage,
} from './diagnostic.js';

const blankImagePath = join(
  import.meta.dirname,
  '../../test/fixtures/diagnostic/blank/20lb/bc0367d0-444a-4f1b-a88e-78de0bda5cb5-back.jpg'
);
const streakedImagePath = join(
  import.meta.dirname,
  '../../test/fixtures/diagnostic/streaked/0dc29646-3c6a-4abd-9d2d-ae1b03a3b4ad-front.jpg'
);

/**
 * Reshapes RGBA image data into the grayscale (one byte per pixel) image data
 * that scanner clients emit. Assumes the RGBA image was actually expanded from
 * a grayscale image originally.
 */
function toGrayscaleImageData({ width, height, data }: ImageData): ImageData {
  const pixels = new Uint8ClampedArray(width * height);
  for (let i = 0; i < pixels.length; i += 1) {
    pixels[i] = data[i * RGBA_CHANNEL_COUNT] as number;
  }
  return { width, height, data: pixels };
}

test('runBlankPaperDiagnostic can pass', async () => {
  expect(await runBlankPaperDiagnostic(blankImagePath)).toEqual(true);
});

test('runBlankPaperDiagnostic can fail', async () => {
  expect(await runBlankPaperDiagnostic(streakedImagePath)).toEqual(false);
});

test('runBlankPaperDiagnosticFromImage accepts RGBA image data', async () => {
  const image = (await loadImageData(blankImagePath)).unsafeUnwrap();
  expect(await runBlankPaperDiagnosticFromImage(image)).toEqual(true);
});

test('runBlankPaperDiagnosticFromImage accepts grayscale image data', async () => {
  const blank = toGrayscaleImageData(
    (await loadImageData(blankImagePath)).unsafeUnwrap()
  );
  expect(await runBlankPaperDiagnosticFromImage(blank)).toEqual(true);

  const streaked = toGrayscaleImageData(
    (await loadImageData(streakedImagePath)).unsafeUnwrap()
  );
  expect(await runBlankPaperDiagnosticFromImage(streaked)).toEqual(false);
});

test('runBlankPaperDiagnosticFromImage rejects malformed image data', async () => {
  await expect(
    runBlankPaperDiagnosticFromImage({
      width: 2,
      height: 2,
      data: new Uint8ClampedArray(3),
    })
  ).rejects.toThrow('Unexpected buffer length');
});
