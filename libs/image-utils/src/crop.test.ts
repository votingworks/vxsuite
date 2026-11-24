import { expect, test } from 'vitest';
import type { ImageData, Rect } from '@votingworks/types';
import fc from 'fast-check';
import { arbitraryImageData, arbitraryRect } from '../test/arbitraries.js';
import { crop } from './crop.js';
import {
  createGrayImageData,
  createImageData,
  getImageChannelCount,
  isRgba,
  toGrayScale,
} from './image_data.js';
import type { int } from './types.js';

/**
 * A slow-but-accurate implementation of `crop` to compare against.
 */
function cropReferenceImplementation(
  imageData: ImageData,
  bounds: Rect
): ImageData {
  const { data: src, width: srcWidth } = imageData;
  const channels = getImageChannelCount(imageData);
  const dst = new Uint8ClampedArray(bounds.width * bounds.height * channels);
  const {
    x: srcOffsetX,
    y: srcOffsetY,
    width: dstWidth,
    height: dstHeight,
  } = bounds;

  for (let y = 0; y < dstHeight; y += 1) {
    const srcY = srcOffsetY + y;

    for (let x = 0; x < dstWidth; x += 1) {
      const srcX = srcOffsetX + x;
      const srcOffset = (srcX + srcY * srcWidth) * channels;
      const dstOffset = (x + y * dstWidth) * channels;

      for (let c = 0; c < channels; c += 1) {
        dst[dstOffset + c] = src[srcOffset + c] as int;
      }
    }
  }

  return isRgba(imageData)
    ? createImageData(dst, dstWidth, dstHeight)
    : createGrayImageData(dst, dstWidth, dstHeight);
}

test('crop center', () => {
  const imageData = createImageData(
    Uint8ClampedArray.of(0, 0, 0, 255, 1, 0, 0, 255),
    2,
    1
  );

  const { data, width, height } = crop(imageData, {
    x: 1,
    y: 0,
    width: 1,
    height: 1,
  });
  expect([...data]).toEqual([1, 0, 0, 255]);
  expect({ width, height }).toEqual({ width: 1, height: 1 });
});

test('crop random', () => {
  fc.assert(
    fc.property(
      arbitraryImageData().chain((imageData) =>
        fc.record({
          imageData: fc.constant(imageData),
          bounds: arbitraryRect({
            maxX: imageData.width - 1,
            maxY: imageData.height - 1,
          }),
        })
      ),
      ({ imageData, bounds }) => {
        const cropped = crop(imageData, bounds);
        const { width, height } = cropped;
        expect(cropped).toEqual(cropReferenceImplementation(imageData, bounds));
        expect({ width, height }).toEqual({
          width: bounds.width,
          height: bounds.height,
        });
      }
    )
  );
});

test('crop grayscale center', () => {
  const imageData = createGrayImageData(Uint8ClampedArray.of(0, 1, 2), 3, 1);

  const cropped = crop(imageData, { x: 1, y: 0, width: 1, height: 1 });
  expect([...cropped.data]).toEqual([1]);
  expect(getImageChannelCount(cropped)).toEqual(1);
});

test('crop grayscale random', () => {
  fc.assert(
    fc.property(
      arbitraryImageData().chain((rgbaImageData) => {
        const imageData = toGrayScale(
          rgbaImageData.data,
          rgbaImageData.width,
          rgbaImageData.height
        );
        return fc.record({
          imageData: fc.constant(imageData),
          bounds: arbitraryRect({
            maxX: imageData.width - 1,
            maxY: imageData.height - 1,
          }),
        });
      }),
      ({ imageData, bounds }) => {
        expect(crop(imageData, bounds)).toEqual(
          cropReferenceImplementation(imageData, bounds)
        );
      }
    )
  );
});
