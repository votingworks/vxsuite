// @coverage-defer-file
import { assert, iter } from '@votingworks/basics';
import { BITS_PER_BYTE } from '@votingworks/message-coder';
import { ImageData } from '@votingworks/image-utils';
import { BitArray, bitArrayToByte, Uint8Max } from './bits.js';
import { PaperHandlerBitmap } from './driver/coders.js';

export interface BinaryBitmap {
  width: number;
  height: number;
  data: boolean[];
}

export interface PaperHandlerBitmapExt extends PaperHandlerBitmap {
  empty?: boolean;
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
const GRAYSCALE_WHITE_THRESHOLD = 230;

/**
 * Converts 8-bit sRGB color values to a binary black/white representation.
 * Uses weighted method without gamma correction for speed.
 *
 * @param r Red color value from 0 - 255
 * @param g Green color value from 0 - 255
 * @param b Blue color value from 0 - 255
 * @returns true for black, false for white
 */
function rgbToBinary(r: number, g: number, b: number): boolean {
  return rgbToGrayscale(r, g, b) < GRAYSCALE_WHITE_THRESHOLD;
}

export function imageDataToBinaryBitmap(imageData: ImageData): BinaryBitmap {
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
        data.push(rgbToBinary(r, g, b));
    }
  });

  return {
    data,
    width: imageData.width,
    height: imageData.height,
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
