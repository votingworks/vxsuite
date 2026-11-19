import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  fromGrayScale,
  loadImageMetadata,
  toImageBuffer,
} from '@votingworks/image-utils';
import { decodeGrayImage } from './index.js';

const jpegPath = join(
  import.meta.dirname,
  '../../test/fixtures/diagnostic/blank/20lb/bc0367d0-444a-4f1b-a88e-78de0bda5cb5-back.jpg'
);

test('decodeGrayImage decodes a JPEG to one byte per pixel', async () => {
  const { width, height } = (await loadImageMetadata(jpegPath)).unsafeUnwrap();
  const image = await decodeGrayImage({ encoded: await readFile(jpegPath) });
  expect(image.width).toEqual(width);
  expect(image.height).toEqual(height);
  expect(image.data).toBeInstanceOf(Uint8ClampedArray);
  expect(image.data.length).toEqual(width * height);
});

test('decodeGrayImage round-trips grayscale pixels through PNG', async () => {
  const pixels = new Uint8ClampedArray([0, 64, 128, 255, 32, 16]);
  const image = await decodeGrayImage({
    encoded: toImageBuffer(fromGrayScale(pixels, 3, 2)),
  });
  expect(image.width).toEqual(3);
  expect(image.height).toEqual(2);
  expect(image.data).toEqual(pixels);
});

test('decodeGrayImage rejects undecodable data', async () => {
  await expect(
    decodeGrayImage({ encoded: new Uint8Array([1, 2, 3]) })
  ).rejects.toThrow(/format could not be determined/);
});
