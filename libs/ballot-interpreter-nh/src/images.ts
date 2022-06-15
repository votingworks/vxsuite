import { assert } from '@votingworks/utils';
import { createCanvas, createImageData, Image, loadImage } from 'canvas';
import { otsu } from './otsu';
import { Point } from './types';

/**
 * Loads an image from a file path.
 */
export async function load(path: string): Promise<Image> {
  return await loadImage(path);
}

/**
 * Get the number of channels in an image data object.
 */
export function getChannels(imageData: ImageData): 1 | 4 {
  const channels = Math.round(
    imageData.data.length / imageData.width / imageData.height
  );
  assert(
    channels === 1 || channels === 4,
    `Expected 1 or 4 channels, got ${channels}`
  );
  return channels;
}

/**
 * Extracts image data from an image.
 */
export function toImageData(
  image: Image,
  {
    maxWidth = image.width,
    maxHeight = image.height,
  }: {
    maxWidth?: number;
    maxHeight?: number;
  } = {}
): ImageData {
  const xScale = maxWidth / image.width;
  const yScale = maxHeight / image.height;
  const scale = Math.min(xScale, yScale);
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');

  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

/**
 * Matches an image against a template image.
 *
 * @param image The image to match within.
 * @param template The template image to match against.
 * @param point The top-left point in the image to start matching.
 *
 * @returns An image whose pixels have luminosity values that are the difference
 *          between the template and the image.
 */
export function matchTemplateImage(
  image: ImageData,
  template: ImageData,
  point: Point
): ImageData {
  const imageChannels = getChannels(image);
  const templateChannels = getChannels(template);
  const resultChannels = imageChannels;
  const result = createImageData(
    new Uint8ClampedArray(template.width * template.height * resultChannels),
    template.width,
    template.height
  );
  const { width: imageWidth } = image;
  const { width: templateWidth, height: templateHeight } = template;
  const px = point.x;
  const py = point.y;

  for (let y = 0; y < templateHeight; y += 1) {
    for (let x = 0; x < templateWidth; x += 1) {
      const lum = image.data[
        ((y + py) * imageWidth + (x + px)) * imageChannels
      ] as number;
      const templateLum = template.data[
        (y * templateWidth + x) * templateChannels
      ] as number;

      const diff = Math.abs(templateLum - lum);
      const resultOffset = (y * templateWidth + x) * resultChannels;

      if (resultChannels === 1) {
        result.data[resultOffset] = diff;
      } else if (resultChannels === 4) {
        result.data[resultOffset] = diff;
        result.data[resultOffset + 1] = diff;
        result.data[resultOffset + 2] = diff;
        result.data[resultOffset + 3] = 255;
      }
    }
  }

  return result;
}

/**
 * Matches an image against a template image. Assumes the images are grayscale,
 * even if they're stored as RGBA.
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
  const imageChannels = getChannels(image);
  const templateChannels = getChannels(template);
  const { width: imageWidth } = image;
  const { width: templateWidth, height: templateHeight } = template;
  const px = point.x;
  const py = point.y;

  const cutoff = 1 - minScore;
  const maxDiff = templateWidth * templateHeight * 255;
  let diff = 0;
  for (let y = 0; y < templateHeight; y += 1) {
    for (let x = 0; x < templateWidth; x += 1) {
      const lum = image.data[
        ((py + y) * imageWidth + (px + x)) * imageChannels
      ] as number;
      const templateLum = template.data[
        (y * templateWidth + x) * templateChannels
      ] as number;
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
 * image compared to a mask.
 */
export function scoreTemplateMatch(image: ImageData, mask: ImageData): number {
  const imageChannels = getChannels(image);
  const maskChannels = getChannels(mask);

  assert(image.width === mask.width, 'expected same width');
  assert(image.height === mask.height, 'expected same height');

  let maxDiff = 0;
  let diff = 0;

  for (
    let offset = 0, maskOffset = 0;
    offset < image.data.length;
    offset += imageChannels, maskOffset += maskChannels
  ) {
    const lum = image.data[offset] as number;
    if (mask.data[maskOffset] === 255) {
      diff += Math.abs(lum - 255);
      maxDiff += 255;
    }
  }

  return 1 - diff / maxDiff;
}

/**
 * Binarizes an image by thresholding it at a given value. Assumes that the
 * image is grayscale, even if it's stored as RGBA.
 */
export function binarize(
  image: ImageData,
  threshold = otsu(image.data, getChannels(image))
): ImageData {
  const channels = getChannels(image);
  const { data, width, height } = image;
  const result = createImageData(
    new Uint8ClampedArray(data.length),
    width,
    height
  );

  for (let offset = 0, { length } = data; offset < length; offset += channels) {
    const lum = data[offset] as number;
    const binarized = lum > threshold ? 255 : 0;

    if (channels === 1) {
      result.data[offset] = binarized;
    } else if (channels === 4) {
      result.data[offset] = binarized;
      result.data[offset + 1] = binarized;
      result.data[offset + 2] = binarized;
      result.data[offset + 3] = 255;
    }
  }

  return result;
}

/**
 * Removes noise from a binarized image by removing pixels without a NSEW
 * neighbor. Assumes that the image is grayscale, even if it's stored as RGBA.
 */
export function simpleRemoveNoise(
  image: ImageData,
  foreground: 0 | 255,
  minimumNeighbors: 0 | 1 | 2 | 3 | 4 = 1
): ImageData {
  const channels = getChannels(image);
  const background = 255 - foreground;
  const { data, width, height } = image;
  const result = createImageData(
    new Uint8ClampedArray(data.length),
    width,
    height
  );

  for (let y = 0, offset = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, offset += channels) {
      const lum = data[offset] as number;
      if (lum === foreground) {
        const n = data[offset - width * channels] as number;
        const s = data[offset + width * channels] as number;
        const e = data[offset + channels] as number;
        const w = data[offset - channels] as number;

        const neighbors =
          (n === foreground ? 1 : 0) +
          (s === foreground ? 1 : 0) +
          (e === foreground ? 1 : 0) +
          (w === foreground ? 1 : 0);
        const isNoise = neighbors < minimumNeighbors;
        const resultLum = isNoise ? background : foreground;

        if (channels === 1) {
          result.data[offset] = resultLum;
        } else if (channels === 4) {
          result.data[offset] = resultLum;
          result.data[offset + 1] = resultLum;
          result.data[offset + 2] = resultLum;
          result.data[offset + 3] = 255;
        }
      }
    }
  }

  return result;
}
