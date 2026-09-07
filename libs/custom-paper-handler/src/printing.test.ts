import { expect, test } from 'vitest';
import { createImageData, ImageData } from '@votingworks/image-utils';
import { assertDefined } from '@votingworks/basics';
import {
  BYTES_PER_CHUNK_COLUMN,
  PaperHandlerBitmapExt,
  getBlackChunk,
  getWhiteChunk,
  imageDataToPaperHandlerChunks,
} from './printing.js';
import { VERTICAL_DOTS_IN_CHUNK } from './driver/constants.js';

function whiteImage(width: number, height: number): ImageData {
  const imageData = createImageData(width, height);
  imageData.data.fill(255);
  return imageData;
}

function paintGray(imageData: ImageData, x: number, y: number, gray: number) {
  imageData.data.set([gray, gray, gray, 255], (y * imageData.width + x) * 4);
}

function paintBlack(imageData: ImageData, x: number, y: number) {
  paintGray(imageData, x, y, 0);
}

/** Asserts the 3 bytes for the given column of a chunk. */
function expectColumnBytes(
  chunk: PaperHandlerBitmapExt,
  x: number,
  expectedBytes: [number, number, number]
) {
  expect(
    Array.from(
      chunk.data.subarray(
        x * BYTES_PER_CHUNK_COLUMN,
        (x + 1) * BYTES_PER_CHUNK_COLUMN
      )
    )
  ).toEqual(expectedBytes);
}

test('imageDataToPaperHandlerChunks packs each column top-down, black = 1', () => {
  const imageData = whiteImage(4, VERTICAL_DOTS_IN_CHUNK);
  // column 0: topmost dot and dot 7 -> first byte 0b1000_0001
  paintBlack(imageData, 0, 0);
  paintBlack(imageData, 0, 7);
  // column 1: dot 8 is the first dot of the second byte
  paintBlack(imageData, 1, 8);
  // column 2: bottom dot of the chunk is the last bit of the third byte
  paintBlack(imageData, 2, VERTICAL_DOTS_IN_CHUNK - 1);
  // column 3: gray 229 is black, gray 231 is white (230 itself is a hair below
  // the threshold in floating point)
  paintGray(imageData, 3, 0, 229);
  paintGray(imageData, 3, 1, 231);

  const chunks = imageDataToPaperHandlerChunks(imageData);
  expect(chunks).toHaveLength(1);
  const chunk = assertDefined(chunks[0]);
  expect(chunk.width).toEqual(4);
  expect(chunk.empty).toEqual(false);
  expect(chunk.data).toHaveLength(4 * BYTES_PER_CHUNK_COLUMN);
  expectColumnBytes(chunk, 0, [0b1000_0001, 0, 0]);
  expectColumnBytes(chunk, 1, [0, 0b1000_0000, 0]);
  expectColumnBytes(chunk, 2, [0, 0, 0b0000_0001]);
  expectColumnBytes(chunk, 3, [0b1000_0000, 0, 0]);
});

test('imageDataToPaperHandlerChunks splits rows into chunks and drops the remainder', () => {
  // 2 full chunks plus 5 rows that do not fill a chunk
  const imageData = whiteImage(2, 2 * VERTICAL_DOTS_IN_CHUNK + 5);
  paintBlack(imageData, 1, VERTICAL_DOTS_IN_CHUNK - 1);
  paintBlack(imageData, 0, VERTICAL_DOTS_IN_CHUNK);
  paintBlack(imageData, 0, 2 * VERTICAL_DOTS_IN_CHUNK + 4);

  const chunks = imageDataToPaperHandlerChunks(imageData);
  expect(chunks).toHaveLength(2);
  expectColumnBytes(assertDefined(chunks[0]), 0, [0, 0, 0]);
  expectColumnBytes(assertDefined(chunks[0]), 1, [0, 0, 0b0000_0001]);
  expectColumnBytes(assertDefined(chunks[1]), 0, [0b1000_0000, 0, 0]);
  expectColumnBytes(assertDefined(chunks[1]), 1, [0, 0, 0]);
});

test('imageDataToPaperHandlerChunks flags all-white chunks as empty', () => {
  const imageData = whiteImage(3, 3 * VERTICAL_DOTS_IN_CHUNK);
  paintBlack(imageData, 2, 2 * VERTICAL_DOTS_IN_CHUNK);

  expect(imageDataToPaperHandlerChunks(imageData)).toEqual([
    { width: 3, data: new Uint8Array(), empty: true },
    { width: 3, data: new Uint8Array(), empty: true },
    {
      width: 3,
      data: new Uint8Array([0, 0, 0, 0, 0, 0, 0b1000_0000, 0, 0]),
      empty: false,
    },
  ]);
});

test('imageDataToPaperHandlerChunks of an image shorter than a chunk is empty', () => {
  expect(
    imageDataToPaperHandlerChunks(whiteImage(10, VERTICAL_DOTS_IN_CHUNK - 1))
  ).toEqual([]);
});

test('getBlackChunk and getWhiteChunk', () => {
  expect(getBlackChunk(2)).toEqual({
    width: 2,
    data: new Uint8Array([255, 255, 255, 255, 255, 255]),
  });
  expect(getWhiteChunk(2)).toEqual({
    width: 2,
    data: new Uint8Array([0, 0, 0, 0, 0, 0]),
  });
});
