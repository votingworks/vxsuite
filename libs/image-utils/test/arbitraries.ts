import { assert } from '@votingworks/basics';
import { Rect } from '@votingworks/types';
import { createImageData, ImageData } from 'canvas';
import fc from 'fast-check';
import { int, RGBA_CHANNEL_COUNT } from '../src/index';
import { assertInteger } from '../src/numeric';

/**
 * Options for building an arbitrary image data.
 */
export interface ArbitraryImageDataOptions {
  readonly width?: int | fc.Arbitrary<int>;
  readonly height?: int | fc.Arbitrary<int>;
  readonly pixels?: fc.Arbitrary<int>;
}

/**
 * Builds an arbitrary `ImageData` object based on the given parameters.
 */
export function arbitraryImageData({
  width: arbitraryWidth = fc.integer({ min: 1, max: 20 }),
  height: arbitraryHeight = fc.integer({ min: 1, max: 20 }),
  pixels: arbitraryPixels = fc.integer({ min: 0, max: 255 }),
}: ArbitraryImageDataOptions = {}): fc.Arbitrary<ImageData> {
  return fc
    .record({
      width:
        typeof arbitraryWidth === 'number'
          ? fc.constant(arbitraryWidth)
          : arbitraryWidth,
      height:
        typeof arbitraryHeight === 'number'
          ? fc.constant(arbitraryHeight)
          : arbitraryHeight,
    })
    .chain(({ width, height }) => {
      assert(width >= 1);
      assert(height >= 1);
      assertInteger(width);
      assertInteger(height);

      const dataLength = width * height * RGBA_CHANNEL_COUNT;
      return fc.record({
        data: fc
          .array(arbitraryPixels, {
            minLength: dataLength,
            maxLength: dataLength,
          })
          .map((data) => {
            const uint8s = Uint8ClampedArray.from(data);

            // make opaque by always setting alpha to 255
            for (
              let i = RGBA_CHANNEL_COUNT - 1;
              i < data.length;
              i += RGBA_CHANNEL_COUNT
            ) {
              uint8s[i] = 255;
            }

            return uint8s;
          }),
        width: fc.constant(width),
        height: fc.constant(height),
      });
    })
    .map(({ data, width, height }) => createImageData(data, width, height));
}

/**
 * Builds an arbitrary {@link Rect} with non-negative integer values.
 */
export function arbitraryRect({
  maxX: arbitraryMaxX = fc.integer({ min: 0, max: 100 }),
  maxY: arbitraryMaxY = fc.integer({ min: 0, max: 100 }),
  minWidth: arbitraryMinWidth = 1,
  minHeight: arbitraryMinHeight = 1,
}: {
  maxX?: int | fc.Arbitrary<int>;
  maxY?: int | fc.Arbitrary<int>;
  minWidth?: int | fc.Arbitrary<int>;
  minHeight?: int | fc.Arbitrary<int>;
} = {}): fc.Arbitrary<Rect> {
  return fc
    .record({
      maxX:
        typeof arbitraryMaxX === 'number'
          ? fc.constant(arbitraryMaxX)
          : arbitraryMaxX,
      maxY:
        typeof arbitraryMaxY === 'number'
          ? fc.constant(arbitraryMaxY)
          : arbitraryMaxY,
      minWidth:
        typeof arbitraryMinWidth === 'number'
          ? fc.constant(arbitraryMinWidth)
          : arbitraryMinWidth,
      minHeight:
        typeof arbitraryMinHeight === 'number'
          ? fc.constant(arbitraryMinHeight)
          : arbitraryMinHeight,
    })
    .chain(({ maxX, maxY, minWidth, minHeight }) =>
      fc
        .record({
          x: fc.integer({ min: 0, max: maxX }),
          y: fc.integer({ min: 0, max: maxY }),
        })
        .chain(({ x, y }) =>
          fc.record({
            x: fc.constant(x),
            y: fc.constant(y),
            width: fc.integer({
              min: minWidth,
              max: Math.max(minWidth, maxX - x),
            }),
            height: fc.integer({
              min: minHeight,
              max: Math.max(minHeight, maxY - y),
            }),
          })
        )
    );
}
