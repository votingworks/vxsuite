import { assert } from '@votingworks/utils';
import { createCanvas, createImageData, loadImage } from 'canvas';
import { otsu } from './otsu';
import { Point } from './types';

/**
 * Converts an image to grayscale.
 */
export function convertToGrayscale(imageData: ImageData): ImageData {
  const channels = imageData.data.length / imageData.width / imageData.height;

  if (channels === 1) {
    return imageData;
  }

  if (channels !== 4) {
    throw new Error(`Expected 4 channels, got ${channels}`);
  }

  const src32 = new Int32Array(imageData.data.buffer);
  const dst = new Uint8ClampedArray(imageData.width * imageData.height);

  for (let offset = 0, { length } = src32; offset < length; offset += 1) {
    const px = src32[offset] as number;
    const r = px & 0xff;
    const g = (px >>> 8) & 0xff;
    const b = (px >>> 16) & 0xff;

    // Luminosity grayscale formula.
    const luminosity = (0.21 * r + 0.72 * g + 0.07 * b) | 0;
    dst[offset] = luminosity;
  }

  return { data: dst, width: imageData.width, height: imageData.height };
}

/**
 * Reads an image in grayscale from a file and scales or resizes to fit if
 * desired. If scaling/resizing, returns the scale that ended up being used
 * when resizing along with the scaled image and the original one. This is
 * useful if you want to compute something based on the scaled image but
 * draw an overlay on the original image, as the `lsd` binary does.
 */
export async function readGrayscaleImage(path: string): Promise<ImageData> {
  const image = await loadImage(path);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, image.width, image.height);
  const imageData = context.getImageData(0, 0, image.width, image.height);
  return convertToGrayscale(imageData);
}

/**
 * Matches an image against a template image.
 *
 * @param image The 1-channel image to match within.
 * @param template The 1-channel template image to match against.
 * @param point The top-left point in the image to start matching.
 *
 * @returns A 1-channel image whose pixels have luminosity values that are the
 *          difference between the template and the image.
 */
export function matchTemplateImage(
  image: ImageData,
  template: ImageData,
  point: Point
): ImageData {
  const result = createImageData(
    new Uint8ClampedArray(template.data.length),
    template.width,
    template.height
  );
  const { width: imageWidth, height: imageHeight } = image;
  const { width: templateWidth, height: templateHeight } = template;
  const px = point.x;
  const py = point.y;

  assert(
    (imageWidth * imageHeight) / image.data.length === 1,
    'expected 1-channel image'
  );
  assert(
    (templateWidth * templateHeight) / template.data.length === 1,
    'expected 1-channel template'
  );

  for (let y = 0; y < templateHeight; y += 1) {
    for (let x = 0; x < templateWidth; x += 1) {
      const lum = image.data[(y + py) * imageWidth + (x + px)] as number;
      const templateLum = template.data[y * templateWidth + x] as number;
      result.data[y * templateWidth + x] = Math.abs(templateLum - lum);
    }
  }

  return result;
}

/**
 * Matches an image against a template image.
 *
 * @param image The image to match within.
 * @param template The template image to match against.
 * @param point The top-left point in the image to start matching.
 * @param minScore The minimum score to consider a match. Providing a value
 *                 here will speed up the matching process.
 *
 * @returns A score between 0 and 1, where 1 is a perfect match. If a minimum
 *          score is provided, returns -1 if the score is below that.
 */
export function matchTemplate(
  image: ImageData,
  template: ImageData,
  point: Point,
  minScore = 0
): number {
  const { width: imageWidth, height: imageHeight } = image;
  const { width: templateWidth, height: templateHeight } = template;
  const px = point.x;
  const py = point.y;

  assert(
    (imageWidth * imageHeight) / image.data.length === 1,
    'expected 1-channel image'
  );
  assert(
    (templateWidth * templateHeight) / template.data.length === 1,
    'expected 1-channel template'
  );

  const cutoff = 1 - minScore;
  const maxDiff = templateWidth * templateHeight * 255;
  let diff = 0;
  for (let y = 0; y < templateHeight; y += 1) {
    for (let x = 0; x < templateWidth; x += 1) {
      const lum = image.data[(py + y) * imageWidth + (px + x)] as number;
      const templateLum = template.data[y * templateWidth + x] as number;
      diff += Math.abs(lum - templateLum);
    }

    if (cutoff < 1 && diff / maxDiff > cutoff) {
      return -1;
    }
  }

  return 1 - diff / maxDiff;
}

/**
 * Scores a template match result image by measuring the total luminosity of the
 * image compared to a completely white image or a mask.
 */
export function scoreTemplateMatch(image: ImageData, mask?: ImageData): number {
  const { width: imageWidth, height: imageHeight } = image;
  let maxDiff = 0;
  let diff = 0;

  for (let y = 0, offset = 0; y < imageHeight; y += 1, offset += imageWidth) {
    for (let x = 0; x < imageWidth; x += 1, offset += 1) {
      const lum = image.data[offset] as number;
      if (!mask || mask.data[offset] === 255) {
        diff += Math.abs(lum - 255);
        maxDiff += 255;
      }
    }
  }

  return 1 - diff / maxDiff;
}

/**
 * Binarizes an image by thresholding it at a given value.
 */
export function binarize(
  image: ImageData,
  threshold = otsu(image.data)
): ImageData {
  const { data, width, height } = image;
  const result = createImageData(
    new Uint8ClampedArray(data.length),
    width,
    height
  );

  for (let offset = 0, { length } = data; offset < length; offset += 1) {
    const lum = data[offset] as number;
    result.data[offset] = lum > threshold ? 255 : 0;
  }

  return result;
}

/**
 * Removes noise from a binarized image by removing pixels without a NSEW neighbor.
 */
export function simpleRemoveNoise(
  image: ImageData,
  foreground: 0 | 255,
  minimumNeighbors: 0 | 1 | 2 | 3 | 4 = 1
): ImageData {
  const background = 255 - foreground;
  const { data, width, height } = image;
  const result = createImageData(
    new Uint8ClampedArray(data.length),
    width,
    height
  );

  for (let y = 0, offset = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, offset += 1) {
      const lum = data[offset] as number;
      if (lum === foreground) {
        const n = data[offset - width] as number;
        const s = data[offset + width] as number;
        const e = data[offset + 1] as number;
        const w = data[offset - 1] as number;

        const neighbors =
          (n === foreground ? 1 : 0) +
          (s === foreground ? 1 : 0) +
          (e === foreground ? 1 : 0) +
          (w === foreground ? 1 : 0);

        result.data[offset] =
          neighbors >= minimumNeighbors ? foreground : background;
      }
    }
  }

  return result;
}
