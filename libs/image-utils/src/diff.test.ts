import { Rect } from '@votingworks/types';
import { createImageData } from 'canvas';
import fc from 'fast-check';
import { arbitraryGrayImage } from '../test/arbitraries';
import {
  describeBinaryImage,
  makeBinaryGrayImage,
  makeGrayscaleImageData,
} from '../test/utils';
import { PIXEL_BLACK, PIXEL_WHITE } from './constants';
import { wrapImageData } from './image_data';
import { GrayImage } from './types';

const imageData4x4 = wrapImageData(
  createImageData(
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
  )
).toGray();

function assertImagesEqual(actual: GrayImage, expected: GrayImage): void {
  expect({ width: actual.width, height: actual.height }).toEqual({
    width: expected.width,
    height: expected.height,
  });
  expect([...actual.asImageData().data]).toEqual([
    ...expected.asImageData().data,
  ]);
}

test('images have no diff with themselves', () => {
  assertImagesEqual(
    imageData4x4.diff(imageData4x4),
    wrapImageData(
      createImageData(
        new Uint8ClampedArray(imageData4x4.length).fill(PIXEL_WHITE),
        imageData4x4.width,
        imageData4x4.height
      )
    ).toGray()
  );
});

test('images have black pixels where compare is black and base is not', () => {
  const a = makeBinaryGrayImage('.#');
  const b = makeBinaryGrayImage('..');

  expect(describeBinaryImage(a.diff(b))).toEqual('..');
  expect(describeBinaryImage(b.diff(a))).toEqual('.#');
});

test('bounds may specify a subset of the images to compare', () => {
  const base = makeBinaryGrayImage('..');
  const compare = makeBinaryGrayImage('.#');

  expect(
    base
      .diff(
        compare,
        { x: 0, y: 0, width: 1, height: 1 },
        { x: 1, y: 0, width: 1, height: 1 }
      )
      .asImageData()
  ).toEqual(makeBinaryGrayImage('#').asImageData());
});

test('all black against all black', () => {
  fc.assert(
    fc.property(
      arbitraryGrayImage({
        pixels: fc.constant(PIXEL_BLACK),
      }),
      (image) => {
        assertImagesEqual(image.diff(image), image.copy().fill(PIXEL_WHITE));
      }
    )
  );
});

test('diff against white background', () => {
  fc.assert(
    fc.property(
      arbitraryGrayImage({
        pixels: fc.constantFrom(PIXEL_BLACK, PIXEL_WHITE),
      }),
      (image) => {
        assertImagesEqual(image.copy().fill(PIXEL_WHITE).diff(image), image);
      }
    )
  );
});

test('comparing part of an image to all of another', () => {
  fc.assert(
    fc.property(
      fc.record({
        base: arbitraryGrayImage(),
        compare: arbitraryGrayImage(),
      }),
      ({ base, compare }) => {
        const bounds: Rect = {
          x: 0,
          y: 0,
          width: Math.min(base.width, compare.width),
          height: Math.min(base.height, compare.height),
        };
        const diffImage = base.diff(compare, bounds, bounds);
        const diffImageByCropping = base
          .crop(bounds)
          .diff(compare.crop(bounds));
        assertImagesEqual(diffImage, diffImageByCropping);
      }
    )
  );
});

test('grayscale compare image to itself', () => {
  const image = makeGrayscaleImageData(
    `
      0123
      4567
      89ab
      cdef
    `
  );
  assertImagesEqual(
    image.diff(image),
    wrapImageData(
      createImageData(
        new Uint8ClampedArray(image.length).fill(PIXEL_WHITE),
        image.width,
        image.height
      )
    ).toGray()
  );
});

test('images with different dimensions', () => {
  const oneByOneImage = fc.sample(
    arbitraryGrayImage({ width: 1, height: 1 }),
    1
  )[0]!;
  const twoByTwoImage = fc.sample(
    arbitraryGrayImage({ width: 2, height: 2 }),
    1
  )[0]!;

  expect(() => oneByOneImage.diff(twoByTwoImage)).toThrowError(
    `baseBounds and compareBounds must have the same size, got 1x1 and 2x2`
  );
});
