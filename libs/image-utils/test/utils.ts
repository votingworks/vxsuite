import { Rect } from '@votingworks/types';
import { createImageData } from 'canvas';
import { AnyImage, GrayImage, int, wrapImageData } from '../src';

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
export function describeImage(
  imageData: AnyImage,
  describePixel: (lum: int, x: int, y: int) => string,
  bounds?: Rect
): string {
  const minY = bounds?.y ?? 0;
  const minX = bounds?.x ?? 0;
  const maxX = (bounds?.x ?? 0) + (bounds?.width ?? imageData.width) - 1;
  const maxY = (bounds?.y ?? 0) + (bounds?.height ?? imageData.height) - 1;
  const channels = imageData.channels;
  const rows = [];
  for (let y = minY; y <= maxY; y += 1) {
    const row = [];
    for (let x = minX; x <= maxX; x += 1) {
      const offset = (y * imageData.width + x) * channels;
      const pixel = imageData.raw(offset);
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
export function describeBinaryImage(
  imageData: GrayImage,
  bounds?: Rect
): string {
  return describeImage(
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
export function assertBinaryImagesEqual(
  actual: GrayImage,
  expected: GrayImage
): void {
  expect(describeBinaryImage(actual)).toEqual(describeBinaryImage(expected));
}

/**
 * Creates an image from a string description.
 *
 * @see {@link describeImage}
 */
export function makeGrayImage(
  description: string,
  decodePixel: (char: string, x: int, y: int) => number
): GrayImage {
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
  }

  const data = new Uint8ClampedArray(width * height);

  for (let y = 0, offset = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, offset += 1) {
      const pixel = decodePixel((rows[y] as string[])[x] as string, x, y);
      data[offset] = pixel;
    }
  }

  return wrapImageData(createImageData(data, width, height)).toGray();
}

/**
 * Creates a binary image from a string description. Use `#` for foreground
 * pixels and `.` for background pixels.
 *
 * @see {@link describeBinaryImage}
 */
export function makeBinaryGrayImage(description: string): GrayImage {
  return makeGrayImage(description, (char, x, y) => {
    switch (char) {
      case '#':
        return F;
      case '.':
        return B;
      default:
        throw new Error(`Invalid pixel '${char}' at (${x}, ${y})`);
    }
  });
}

/**
 * Creates a grayscale image from a string description. Use hexadecimal digits
 * for pixel values, with `0` being black and `f` being white.
 *
 * @see {@link describeBinaryImage}
 */
export function makeGrayscaleImageData(description: string): GrayImage {
  return makeGrayImage(description, (char) => parseInt(char, 16) * 0x11);
}
