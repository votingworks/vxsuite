/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { assert, iter } from '@votingworks/basics';
import { BITS_PER_BYTE } from '@votingworks/message-coder';
import { ImageData } from '@votingworks/image-utils';
import { BitArray, bitArrayToByte, Uint8Max } from './bits';
import { PaperHandlerBitmap } from './driver/coders';

export interface BinaryBitmap {
  width: number;
  height: number;
  data: boolean[];
}

export interface PaperHandlerBitmapExt extends PaperHandlerBitmap {
  empty?: boolean;
}

// Grayscale conversion algorithm used is from
// https://en.wikipedia.org/wiki/Grayscale#Colorimetric_(perceptual_luminance-preserving)_conversion_to_grayscale

/**
 *
 * @param x Gamma-compressed color value
 * @returns
 */
function gammaExpand(x: number) {
  if (x < 0.04045) {
    return x / 12.92;
  }

  return ((x + 0.055) / 1.055) ** 2.4;
}

function gammaCompress(x: number) {
  if (x < 0.0031308) {
    return x * 12.92;
  }

  return 1.055 * x ** (1 / 1.24) - 0.055;
}

/**
 * Converts 8-bit sRGB color values to an 8-bit grayscale value with gamma
 * correction.
 *
 * @param r Red color value from 0 - 255
 * @param g Green color value from 0 - 255
 * @param b Blue color value from 0 - 255
 * @returns Grayscale color value from 0 - 255
 */
export function rgbToGrayscaleGamma(r: number, g: number, b: number): number {
  return (
    gammaCompress(
      0.2126 * gammaExpand(r / 256) +
        0.7152 * gammaExpand(g / 256) +
        0.0722 * gammaExpand(b / 256)
    ) * 256
  );
}

/**
 * Converts 8-bit sRGB color values to an 8-bit grayscale value without gamma
 * correction.
 *
 * @param r Red color value from 0 - 255
 * @param g Green color value from 0 - 255
 * @param b Blue color value from 0 - 255
 * @returns Grayscale color value from 0 - 255
 */
export function rgbToGrayscale(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Below this value, we consider the grayscale to be black. Otherwise, white.
 */
const DEFAULT_GRAYSCALE_WHITE_THRESHOLD = 230;

export interface ImageConversionOptions {
  useGammaConversion: boolean;
  // number in [0, 256), above which the grayscale will be considered white
  whiteThreshold: number;
}

export const DEFAULT_IMAGE_CONVERSION_OPTIONS: ImageConversionOptions = {
  useGammaConversion: false,
  whiteThreshold: DEFAULT_GRAYSCALE_WHITE_THRESHOLD,
};

/**
 * Converts 8-bit sRGB color values to a binary black/white representation.
 * Uses weighted method without gamma correction for speed.
 *
 * @param r Red color value from 0 - 255
 * @param g Green color value from 0 - 255
 * @param b Blue color value from 0 - 255
 * @returns true for black, false for white
 */

function rgbToBinary(
  r: number,
  g: number,
  b: number,
  options: ImageConversionOptions
): boolean {
  const grayscaleValue = (
    options.useGammaConversion ? rgbToGrayscaleGamma : rgbToGrayscale
  )(r, g, b);
  return grayscaleValue < options.whiteThreshold;
}

export function imageDataToBinaryBitmapOg(
  imageData: ImageData,
  overrideOptions: Partial<ImageConversionOptions> = {}
): BinaryBitmap {
  const options: ImageConversionOptions = {
    ...DEFAULT_IMAGE_CONVERSION_OPTIONS,
    ...overrideOptions,
  };

  const data: boolean[] = [];

  let r = 0;
  let g = 0;
  let b = 0;
  imageData.data.forEach((element, index) => {
    // ImageData.data is in RGBA format. Map RBG values to grayscale.
    // eslint-disable-next-line default-case
    switch (index % 4) {
      case 0:
        r = element;
        return;
      case 1:
        g = element;
        return;
      case 2:
        b = element;
        return;
      case 3:
        data.push(rgbToBinary(r, g, b, options));
    }
  });

  return {
    data,
    width: imageData.width,
    height: imageData.height,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function applyFloydSteinbergDithering(imageData: ImageData): ImageData {
  const { width, height, data: pixels } = imageData;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const gray =
        0.3 * pixels[idx]! + 0.59 * pixels[idx + 1]! + 0.11 * pixels[idx + 2]!;
      const newPixel = gray > 127.5 ? 255 : 0;
      const err = Math.floor((gray - newPixel) / 16);

      pixels[idx] = newPixel;
      pixels[idx + 1] = newPixel;
      pixels[idx + 2] = newPixel;

      // Distribute the quantization error
      if (x + 1 < width) {
        pixels[idx + 4]! += err * 7; // Right
      }
      if (y + 1 < height) {
        if (x > 0) {
          pixels[idx + width * 4 - 4]! += err * 3; // Bottom Left
        }
        pixels[idx + width * 4]! += err * 5; // Bottom
        if (x + 1 < width) {
          pixels[idx + width * 4 + 4]! += err * 1; // Bottom Right
        }
      }
    }
  }

  return imageData;
}

function applyAtkinsonDithering(imageData: ImageData): ImageData {
  const { width } = imageData;
  const { height } = imageData;
  const pixels = imageData.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const gray =
        0.3 * pixels[idx]! + 0.59 * pixels[idx + 1]! + 0.11 * pixels[idx + 2]!;
      const oldPixel = gray;
      const newPixel = oldPixel > 128 ? 255 : 0;
      const quantError = Math.floor((oldPixel - newPixel) / 8);

      pixels[idx] = newPixel;
      pixels[idx + 1] = newPixel;
      pixels[idx + 2] = newPixel;

      // Spread the quantization error to the neighboring pixels
      const neighbors = [
        { dx: 1, dy: 0 },
        { dx: 2, dy: 0 }, // Right
        { dx: -1, dy: 1 },
        { dx: 0, dy: 1 },
        { dx: 1, dy: 1 }, // Below and below-left
        { dx: 0, dy: 2 }, // Two rows below
      ];

      for (const { dx, dy } of neighbors) {
        if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          pixels[i] = Math.min(255, pixels[i]! + quantError);
          pixels[i + 1] = Math.min(255, pixels[i + 1]! + quantError);
          pixels[i + 2] = Math.min(255, pixels[i + 2]! + quantError);
        }
      }
    }
  }
  return new ImageData(pixels, width, height);
}

export function imageDataToBinaryBitmapDithering(
  imageData: ImageData,
  overrideOptions: Partial<ImageConversionOptions> = {}
): BinaryBitmap {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const options: ImageConversionOptions = {
    ...DEFAULT_IMAGE_CONVERSION_OPTIONS,
    ...overrideOptions,
  };

  // Apply Atkinson dithering to the entire image first
  const ditheredImageData = applyAtkinsonDithering(imageData);

  const data: boolean[] = [];
  for (let i = 0; i < ditheredImageData.data.length; i += 4) {
    // After dithering, pixels are either black or white, so we just need to check one channel
    const isBlack = ditheredImageData.data[i]! < 128; // Assuming dithering sets channel values to 0 or 255
    data.push(!!isBlack);
  }

  // Construct and return the BinaryBitmap from the dithered data
  return {
    data,
    height: imageData.height,
    width: imageData.width,
  };
}

export function chunkBinaryBitmap(
  binaryBitmap: BinaryBitmap
): PaperHandlerBitmapExt[] {
  const paperHandlerBitmaps: PaperHandlerBitmapExt[] = [];

  // Each chunk will be 24 dots high. Since for this prototype, we're likely
  // not printing in the lowest 8 or 24 rows of dots, just ignore those.
  const numChunkRows = Math.floor(binaryBitmap.height / 24);
  for (
    let chunkRowIndex = 0;
    chunkRowIndex < numChunkRows;
    chunkRowIndex += 1
  ) {
    const chunkOrderBits: boolean[] = [];
    let empty = true;
    for (let column = 0; column < binaryBitmap.width; column += 1) {
      for (
        let row = chunkRowIndex * 24;
        row < chunkRowIndex * 24 + 24;
        row += 1
      ) {
        const bit = binaryBitmap.data[row * binaryBitmap.width + column];
        assert(bit !== undefined);
        chunkOrderBits.push(bit);
        if (bit) {
          empty = false;
        }
      }
    }

    if (empty) {
      paperHandlerBitmaps.push({
        data: new Uint8Array([]),
        width: binaryBitmap.width,
        empty,
      });
      continue;
    }

    const chunks = iter(chunkOrderBits)
      .chunks(BITS_PER_BYTE)
      .map((bits) => bits as BitArray)
      .map(bitArrayToByte);

    paperHandlerBitmaps.push({
      data: new Uint8Array(chunks),
      width: binaryBitmap.width,
      empty,
    });
  }
  return paperHandlerBitmaps;
}

export function getBlackChunk(width: number): PaperHandlerBitmapExt {
  return {
    width,
    data: new Uint8Array(width * 3).fill(Uint8Max),
  };
}

export function getWhiteChunk(width: number): PaperHandlerBitmapExt {
  return {
    width,
    data: new Uint8Array(width * 3).fill(0),
  };
}
