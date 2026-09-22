import { BITS_PER_BYTE } from '@votingworks/message-coder';
import { RgbaImageData } from '@votingworks/types';
import { RGBA_CHANNEL_COUNT, rgbToGrayscale } from '@votingworks/image-utils';
import { PaperHandlerBitmap } from './driver/coders.js';
import { VERTICAL_DOTS_IN_CHUNK } from './driver/constants.js';

export interface PaperHandlerBitmapExt extends PaperHandlerBitmap {
  empty?: boolean;
}

/**
 * Below this value, we consider the grayscale to be black. Otherwise, white.
 */
const GRAYSCALE_WHITE_THRESHOLD = 230;

export const BYTES_PER_CHUNK_COLUMN = VERTICAL_DOTS_IN_CHUNK / BITS_PER_BYTE;

/**
 * Converts an image into the chunks the paper handler prints in image print
 * mode: bands `VERTICAL_DOTS_IN_CHUNK` dots high, each column of a band packed
 * top-down into `BYTES_PER_CHUNK_COLUMN` bytes, MSB = topmost dot, 1 = black.
 * An all-white chunk carries no data and is flagged `empty` so the caller can
 * skip it by advancing the print position instead of printing it.
 */
export function imageDataToPaperHandlerChunks(
  imageData: RgbaImageData
): PaperHandlerBitmapExt[] {
  const { width: imageDataWidth, height: imageDataHeight, data } = imageData;
  // Rows below the last full chunk are dropped: printing close to the bottom
  // of the page can wedge the printer-scanner, and the bottom of our summary
  // ballots is blank anyway.
  const chunkCount = Math.floor(imageDataHeight / VERTICAL_DOTS_IN_CHUNK);
  const bytesPerChunk = imageDataWidth * BYTES_PER_CHUNK_COLUMN;
  const chunkBytes = new Uint8Array(chunkCount * bytesPerChunk);

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const chunkBytesStart = chunkIndex * bytesPerChunk;
    const chunkFirstRow = chunkIndex * VERTICAL_DOTS_IN_CHUNK;

    for (let x = 0; x < imageDataWidth; x += 1) {
      const columnBytesStart = chunkBytesStart + x * BYTES_PER_CHUNK_COLUMN;

      for (
        let byteIndex = 0;
        byteIndex < BYTES_PER_CHUNK_COLUMN;
        byteIndex += 1
      ) {
        let byte = 0;
        for (let bit = 0; bit < BITS_PER_BYTE; bit += 1) {
          const y = chunkFirstRow + byteIndex * BITS_PER_BYTE + bit;
          const imageDataByteOffset =
            (y * imageDataWidth + x) * RGBA_CHANNEL_COUNT;
          const isBlack =
            rgbToGrayscale(
              data[imageDataByteOffset] as number,
              data[imageDataByteOffset + 1] as number,
              data[imageDataByteOffset + 2] as number
            ) < GRAYSCALE_WHITE_THRESHOLD;
          byte <<= 1;
          if (isBlack) {
            byte |= 1;
          }
        }
        chunkBytes[columnBytesStart + byteIndex] = byte;
      }
    }
  }

  const chunks: PaperHandlerBitmapExt[] = [];
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const chunkData = chunkBytes.slice(
      chunkIndex * bytesPerChunk,
      (chunkIndex + 1) * bytesPerChunk
    );
    const empty = chunkData.every((byte) => byte === 0);
    chunks.push({
      width: imageDataWidth,
      data: empty ? new Uint8Array() : chunkData,
    });
  }
  return chunks;
}
