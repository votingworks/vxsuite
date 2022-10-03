import { Rect } from '@votingworks/types';
import { assert } from '@votingworks/utils';
import { createImageData } from 'canvas';
import fc from 'fast-check';
import {
  GRAY_CHANNEL_COUNT,
  int,
  RGBA_CHANNEL_COUNT,
  RGB_CHANNEL_COUNT,
} from '../src';
import { assertInteger } from '../src/numeric';

/**
 * Returns an arbitrary image channel count.
 */
export function arbitraryChannelCount(): fc.Arbitrary<int> {
  return fc.constantFrom(
    GRAY_CHANNEL_COUNT,
    RGB_CHANNEL_COUNT,
    RGBA_CHANNEL_COUNT
  );
}

/**
 * Options for building an arbitrary image data.
 */
export interface ArbitraryImageDataOptions {
  readonly width?: int | fc.Arbitrary<int>;
  readonly height?: int | fc.Arbitrary<int>;
  readonly channels?: int | fc.Arbitrary<int>;
  readonly pixels?: fc.Arbitrary<int>;
}

/**
 * Builds an arbitrary `ImageData` object based on the given parameters.
 */
export function arbitraryImageData({
  width: arbitraryWidth = fc.integer({ min: 1, max: 20 }),
  height: arbitraryHeight = fc.integer({ min: 1, max: 20 }),
  channels: arbitraryChannels = arbitraryChannelCount(),
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
      channels:
        typeof arbitraryChannels === 'number'
          ? fc.constant(arbitraryChannels)
          : arbitraryChannels,
    })
    .chain(({ width, height, channels }) => {
      assert(width >= 1);
      assert(height >= 1);
      assert(channels >= 1);
      assertInteger(width);
      assertInteger(height);
      assertInteger(channels);

      const dataLength = width * height * channels;
      return fc.record({
        data: fc
          .array(arbitraryPixels, {
            minLength: dataLength,
            maxLength: dataLength,
          })
          .map((data) => {
            const uint8s = Uint8ClampedArray.from(data);

            // make opaque by always setting alpha to 255
            if (channels === RGBA_CHANNEL_COUNT) {
              for (let i = 3; i < data.length; i += channels) {
                uint8s[i] = 255;
              }
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

/**
 * Builds an arbitrary RGBA image data object.
 */
export function arbitraryImageDataRgba(
  options: Omit<ArbitraryImageDataOptions, 'channels'> = {}
): fc.Arbitrary<ImageData> {
  return arbitraryImageData({ ...options, channels: RGBA_CHANNEL_COUNT });
}
