import { Rect } from '@votingworks/types';
import { createImageData } from 'canvas';
import { lines } from '@votingworks/basics';
import { int } from '../src';
import { getImageChannelCount } from '../src/image_data';

/** foreground, represented as '#' in descriptions */
export const F = 0x00;

/** background, represented as '.' in descriptions */
export const B = 0xff;

/**
 * Produces a string representation of an image.
 *
 * @param imageData - the image data to describe
 * @param describePixel - a function that describes a single pixel with a single character
 * @param bounds - the bounds of the image to describe
 */
export function describeImageData(
  imageData: ImageData,
  describePixel: (lum: int, x: int, y: int) => string,
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
      const pixel = imageData.data[offset] as int;
      row.push(describePixel(pixel, x, y));
    }
    rows.push(row.join(''));
  }
  return rows.join('\n');
}

/**
 * Produces a string representation of a binary image.
 *
 * @see {@link makeBinaryImageData}
 */
export function describeBinaryImageData(
  imageData: ImageData,
  bounds?: Rect
): string {
  return describeImageData(
    imageData,
    (lum, x, y) => {
      switch (lum) {
        case F:
          return '#';
        case B:
          return '.';
        default:
          throw new Error(`Invalid pixel ${lum} at (${x}, ${y})`);
      }
    },
    bounds
  );
}

/**
 * Asserts that two binary images are equal, i.e. have the same dimensions and
 * the same foreground/background pixels.
 */
export function assertBinaryImageDatasEqual(
  actual: ImageData,
  expected: ImageData
): void {
  expect(describeBinaryImageData(actual)).toEqual(
    describeBinaryImageData(expected)
  );
}

/**
 * Creates an image from a string description.
 *
 * @see {@link describeImageData}
 */
export function makeImageData(
  description: string,
  decodePixel: (char: string, x: int, y: int) => number,
  channelCount: 1 | 4
): ImageData {
  const rows = lines(description)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => row.split(''))
    .toArray();
  const height = rows.length;
  let width = 0;
  for (const row of rows) {
    if (width && row.length !== width) {
      throw new Error(`Row ${rows.indexOf(row)} has wrong width`);
    }
    width = row.length;
  }

  const data = new Uint8ClampedArray(width * height * channelCount);

  for (let y = 0, offset = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, offset += channelCount) {
      const pixel = decodePixel((rows[y] as string[])[x] as string, x, y);
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

/**
 * Creates a binary image from a string description. Use `#` for foreground
 * pixels and `.` for background pixels.
 *
 * @see {@link describeBinaryImageData}
 */
export function makeBinaryImageData(
  description: string,
  channelCount: 1 | 4 = 4
): ImageData {
  return makeImageData(
    description,
    (char, x, y) => {
      switch (char) {
        case '#':
          return F;
        case '.':
          return B;
        default:
          throw new Error(`Invalid pixel '${char}' at (${x}, ${y})`);
      }
    },
    channelCount
  );
}

/**
 * Creates a grayscale image from a string description. Use hexadecimal digits
 * for pixel values, with `0` being black and `f` being white.
 *
 * @see {@link describeBinaryImageData}
 */
export function makeGrayscaleImageData(
  description: string,
  channelCount: 1 | 4 = 4
): ImageData {
  return makeImageData(
    description,
    (char) => parseInt(char, 16) * 0x11,
    channelCount
  );
}
