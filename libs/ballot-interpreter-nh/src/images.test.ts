import { getImageChannelCount } from '@votingworks/image-utils';
import { createImageData } from 'canvas';
import { matchTemplateImage } from './images';
import { Rect } from './types';
import { loc } from './utils';

/** foreground, represented as '#' in descriptions */
const F = 0xff;

/** background, represented as '.' in descriptions */
const B = 0x00;

/**
 *
 */
function describeBinaryImageData(imageData: ImageData, bounds?: Rect): string {
  const {
    minY = 0,
    minX = 0,
    maxX = imageData.width - 1,
    maxY = imageData.height - 1,
  } = bounds ?? {};
  const channels = getImageChannelCount(imageData);
  const rows = [];
  for (let y = minY; y <= maxY; y += 1) {
    const row = [];
    for (let x = minX; x <= maxX; x += 1) {
      const offset = (y * imageData.width + x) * channels;
      const pixel = imageData.data[offset];
      row.push(pixel === F ? '#' : '.');
    }
    rows.push(row.join(''));
  }
  return rows.join('\n');
}

function assertBinaryImageDatasEqual(
  actual: ImageData,
  expected: ImageData
): void {
  expect(describeBinaryImageData(actual)).toBe(
    describeBinaryImageData(expected)
  );
}

function makeBinaryImageData(description: string): ImageData {
  const rows = description
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => row.split(''));
  const height = rows.length;
  let width = 0;
  for (const row of rows) {
    if (width && row.length !== width) {
      throw new Error(`Row ${rows.indexOf(row)} has wrong width`);
    }
    width = row.length;

    for (const cell of row) {
      if (cell !== '.' && cell !== '#') {
        throw new Error(`Invalid cell: ${cell}`);
      }
    }
  }

  const imageData = createImageData(width, height);

  for (let y = 0, offset = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, offset += 4) {
      const pixel = rows[y]![x] === '#' ? F : B;
      imageData.data[offset + 0] = pixel;
      imageData.data[offset + 1] = pixel;
      imageData.data[offset + 2] = pixel;
      imageData.data[offset + 3] = 255;
    }
  }

  return imageData;
}

test('matchTemplateImage returns all-background matching an image against itself', () => {
  const imageData = makeBinaryImageData(`
    .#....
    ...#..
    .#...#
  `);

  const allBackground = makeBinaryImageData(`
    ......
    ......
    ......
  `);

  assertBinaryImageDatasEqual(
    matchTemplateImage(imageData, imageData, loc(0, 0)),
    allBackground
  );
});

test('matchTemplateImage sets foreground pixels where the images differ', () => {
  const imageData = makeBinaryImageData(`
    .#....
    ...#..
    .#...#
  `);

  const template = makeBinaryImageData(`
    .#..#.
    ......
    ...#..
  `);

  const expected = makeBinaryImageData(`
    ....#.
    ...#..
    .#.#.#
  `);

  assertBinaryImageDatasEqual(
    matchTemplateImage(imageData, template, loc(0, 0)),
    expected
  );
});
