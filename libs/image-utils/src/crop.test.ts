import { expect, test } from 'vitest';
import { Rect } from '@votingworks/types';
import { createImageData, ImageData } from 'canvas';
import fc from 'fast-check';
import { arbitraryImageData, arbitraryRect } from '../test/arbitraries';
import { crop } from './crop';
import { int } from './types';
import { RGBA_CHANNEL_COUNT } from './index';

/**
 * A slow-but-accurate implementation of `crop` to compare against.
 */
function cropReferenceImplementation(
  { data: src, width: srcWidth }: ImageData,
  bounds: Rect
): ImageData {
  const dst = new Uint8ClampedArray(
    bounds.width * bounds.height * RGBA_CHANNEL_COUNT
  );
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
      const srcOffset = (srcX + srcY * srcWidth) * RGBA_CHANNEL_COUNT;
      const dstOffset = (x + y * dstWidth) * RGBA_CHANNEL_COUNT;

      for (let c = 0; c < RGBA_CHANNEL_COUNT; c += 1) {
        dst[dstOffset + c] = src[srcOffset + c] as int;
      }
    }
  }

  return createImageData(dst, dstWidth, dstHeight);
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
