import { Rect } from '@votingworks/types';
import { createImageData } from 'canvas';
import fc from 'fast-check';
import { arbitraryImageData } from '../test/arbitraries';
import { makeGrayscaleImageData } from '../test/utils';
import { crop } from './crop';
import { diff, PIXEL_BLACK, PIXEL_WHITE } from './diff';

const imageData4x4: Readonly<ImageData> = createImageData(
  Uint8ClampedArray.of(
    // y=0
    PIXEL_BLACK,
    PIXEL_WHITE,
    PIXEL_WHITE,
    PIXEL_WHITE,
    // y=1
    PIXEL_WHITE,
    PIXEL_BLACK,
    PIXEL_WHITE,
    PIXEL_WHITE,
    // y=2
    PIXEL_WHITE,
    PIXEL_WHITE,
    PIXEL_BLACK,
    PIXEL_WHITE,
    // y=3
    PIXEL_WHITE,
    PIXEL_WHITE,
    PIXEL_WHITE,
    PIXEL_BLACK
  ),
  4,
  4
);

function assertImagesEqual(actual: ImageData, expected: ImageData): void {
  expect({ width: actual.width, height: actual.height }).toEqual({
    width: expected.width,
    height: expected.height,
  });
  expect([...actual.data]).toEqual([...expected.data]);
}

test('images have no diff with themselves', () => {
  assertImagesEqual(
    diff(imageData4x4, imageData4x4),
    createImageData(
      new Uint8ClampedArray(imageData4x4.data.length).fill(PIXEL_WHITE),
      imageData4x4.width,
      imageData4x4.height
    )
  );
});

test('images have black pixels where compare is black and base is not', () => {
  const base = createImageData(
    Uint8ClampedArray.of(PIXEL_BLACK, PIXEL_WHITE),
    2,
    1
  );
  const compare = createImageData(
    Uint8ClampedArray.of(PIXEL_BLACK, PIXEL_BLACK),
    2,
    1
  );

  expect([...diff(base, compare).data]).toEqual([PIXEL_WHITE, PIXEL_BLACK]);
});

test('bounds may specify a subset of the images to compare', () => {
  const base = createImageData(
    Uint8ClampedArray.of(PIXEL_BLACK, PIXEL_WHITE),
    2,
    1
  );
  const compare = createImageData(
    Uint8ClampedArray.of(PIXEL_BLACK, PIXEL_BLACK),
    2,
    1
  );

  expect([
    ...diff(
      base,
      compare,
      { x: 1, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: 1, height: 1 }
    ).data,
  ]).toEqual([PIXEL_BLACK]);
});

test('all black against all black', () => {
  fc.assert(
    fc.property(
      arbitraryImageData({
        channels: fc.constantFrom(1, 4),
        pixels: fc.constant(PIXEL_BLACK),
      }),
      (imageData) => {
        assertImagesEqual(
          diff(imageData, imageData),
          createImageData(
            new Uint8ClampedArray(imageData.data.length).fill(PIXEL_WHITE),
            imageData.width,
            imageData.height
          )
        );
      }
    )
  );
});

test('diff against white background', () => {
  fc.assert(
    fc.property(
      arbitraryImageData({
        channels: fc.constantFrom(1, 4),
        pixels: fc.constantFrom(PIXEL_BLACK, PIXEL_WHITE),
      }),
      (imageData) => {
        assertImagesEqual(
          diff(
            createImageData(
              new Uint8ClampedArray(imageData.data.length).fill(PIXEL_WHITE),
              imageData.width,
              imageData.height
            ),
            imageData
          ),
          imageData
        );
      }
    )
  );
});

test('comparing part of an image to all of another', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(1, 4).chain((channels) =>
        fc.record({
          base: arbitraryImageData({ channels }),
          compare: arbitraryImageData({ channels }),
        })
      ),
      ({ base, compare }) => {
        const bounds: Rect = {
          x: 0,
          y: 0,
          width: Math.min(base.width, compare.width),
          height: Math.min(base.height, compare.height),
        };
        const diffImage = diff(base, compare, bounds, bounds);
        const diffImageByCropping = diff(
          crop(base, bounds),
          crop(compare, bounds)
        );
        assertImagesEqual(diffImage, diffImageByCropping);
      }
    )
  );
});

test('grayscale compare image to itself', () => {
  const imageData = makeGrayscaleImageData(
    `
      0123
      4567
      89ab
      cdef
    `,
    1
  );
  assertImagesEqual(
    diff(imageData, imageData),
    createImageData(
      new Uint8ClampedArray(imageData.data.length).fill(PIXEL_WHITE),
      imageData.width,
      imageData.height
    )
  );
});

test('images with different channel counts', () => {
  const oneChannelImage = fc.sample(
    arbitraryImageData({ channels: 1, width: 1, height: 1 }),
    1
  )[0]!;
  const fourChannelImage = fc.sample(
    arbitraryImageData({ channels: 4, width: 1, height: 1 }),
    1
  )[0]!;

  expect(() => diff(oneChannelImage, fourChannelImage)).toThrowError(
    `base and compare must have the same number of channels, got 1 and 4`
  );
});

test('images with different dimensions', () => {
  const oneByOneImage = fc.sample(
    arbitraryImageData({ channels: 1, width: 1, height: 1 }),
    1
  )[0]!;
  const twoByTwoImage = fc.sample(
    arbitraryImageData({ channels: 1, width: 2, height: 2 }),
    1
  )[0]!;

  expect(() => diff(oneByOneImage, twoByTwoImage)).toThrowError(
    `baseBounds and compareBounds must have the same size, got 1x1 and 2x2`
  );
});

test('image with 3 channels', () => {
  const image = createImageData(
    Uint8ClampedArray.of(PIXEL_BLACK, PIXEL_BLACK, PIXEL_BLACK),
    1,
    1
  );

  expect(() => diff(image, image)).toThrowError(
    `unsupported number of channels: 3`
  );
});
