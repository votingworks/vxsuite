import { Rect } from '@votingworks/types';
import { createImageData } from 'canvas';
import * as fc from 'fast-check';
import { crop } from '../src';
import { arbitraryImageData } from './arbitraries';
import {
  assertBinaryImageDatasEqual,
  describeBinaryImageData,
  makeBinaryImageData,
  makeGrayscaleImageData,
} from './utils';

test('describeBinaryImageData & makeBinaryImageData', () => {
  fc.assert(
    fc.property(
      arbitraryImageData({ channels: 1, pixels: fc.constantFrom(0, 255) }),
      (image) => {
        const description = describeBinaryImageData(image);
        const reconstructed = makeBinaryImageData(description);
        assertBinaryImageDatasEqual(image, reconstructed);
      }
    )
  );
});

test('junk image descriptions', () => {
  expect(() => makeBinaryImageData('')).toThrow();
  expect(() => makeBinaryImageData(' ')).toThrow();
  expect(() => makeGrayscaleImageData('')).toThrow();
});

test('invalid binary images', () => {
  expect(() =>
    describeBinaryImageData(createImageData(Uint8ClampedArray.of(127), 1, 1))
  ).toThrow('Invalid pixel 127 at (0, 0)');
});

test('describeBinaryImageData & makeBinaryImageData with cropping', () => {
  fc.assert(
    fc.property(
      arbitraryImageData({
        channels: 1,
        pixels: fc.constantFrom(0, 255),
      }).chain((image) =>
        fc.record({
          image: fc.constant(image),
          x: fc.integer({ min: 0, max: image.width - 1 }),
          y: fc.integer({ min: 0, max: image.height - 1 }),
        })
      ),
      ({ image, x, y }) => {
        const bounds: Rect = { x, y, width: 1, height: 1 };
        const description = describeBinaryImageData(image, bounds);
        const reconstructed = makeBinaryImageData(description);
        assertBinaryImageDatasEqual(crop(image, bounds), reconstructed);
      }
    )
  );
});

test('makeBinaryImageData fails with an invalid description', () => {
  expect(() => makeBinaryImageData('invalid')).toThrowError();
});

test('makeBinaryImageData fails with mismatching widths', () => {
  expect(() => makeBinaryImageData('##\n###')).toThrowError();
});
