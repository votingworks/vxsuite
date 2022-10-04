import { Rect } from '@votingworks/types';
import { createImageData } from 'canvas';
import { getImageChannelCount } from '../src/image_data';

/** foreground, represented as '#' in descriptions */
export const F = 0xff;

/** background, represented as '.' in descriptions */
export const B = 0x00;

/**
 * Produces a string representation of a binary image.
 *
 * @see {@link makeBinaryImageData}
 */
export function describeBinaryImageData(
  imageData: ImageData,
  bounds?: Rect
): string {
  const minY = bounds?.y ?? 0;
  const minX = bounds?.x ?? 0;
  const maxX = (bounds?.x ?? 0) + (bounds?.width ?? imageData.width) - 1;
  const maxY = (bounds?.y ?? 0) + (bounds?.height ?? imageData.height) - 1;
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

/**
 * Asserts that two binary images are equal, i.e. have the same dimensions and
 * the same foreground/background pixels.
 */
export function assertBinaryImageDatasEqual(
  actual: ImageData,
  expected: ImageData
): void {
  expect(describeBinaryImageData(actual)).toBe(
    describeBinaryImageData(expected)
  );
}

/**
 * Creates a binary image from a string description.
 *
 * @see {@link describeBinaryImageData}
 */
export function makeBinaryImageData(
  description: string,
  channelCount: 1 | 4 = 4
): ImageData {
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

  const data = new Uint8ClampedArray(width * height * channelCount);

  for (let y = 0, offset = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, offset += 4) {
      const pixel = (rows[y] as string[])[x] === '#' ? F : B;
      if (channelCount === 1) {
        data[offset] = pixel;
      } else {
        data[offset + 0] = pixel;
        data[offset + 1] = pixel;
        data[offset + 2] = pixel;
        data[offset + 3] = 255;
      }
    }
  }

  return createImageData(data, width, height);
}
