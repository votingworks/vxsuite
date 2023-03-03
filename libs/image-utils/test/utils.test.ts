import { Rect } from '@votingworks/types';
import { createImageData } from 'canvas';
import * as fc from 'fast-check';
import { wrapImageData } from '../src';
import { arbitraryImage } from './arbitraries';
import {
  assertBinaryImagesEqual,
  describeBinaryImage,
  makeBinaryGrayImage,
} from './utils';

test('describeBinaryImage & makeBinaryGrayImage', () => {
  fc.assert(
    fc.property(
      arbitraryImage({ channels: 1, pixels: fc.constantFrom(0, 255) }),
      (image) => {
        const description = describeBinaryImage(image);
        const reconstructed = makeBinaryGrayImage(description);
        assertBinaryImagesEqual(image, reconstructed);
      }
    )
  );
});

test('junk image descriptions', () => {
  expect(() => makeBinaryGrayImage('')).toThrow();
  expect(() => makeBinaryGrayImage(' ')).toThrow();
});

test('invalid binary images', () => {
  expect(() =>
    describeBinaryImage(
      wrapImageData(createImageData(Uint8ClampedArray.of(127), 1, 1)).toGray()
    )
  ).toThrow('Invalid pixel 127 at (0, 0)');
});

test('describeBinaryImage & makeBinaryGrayImage with cropping', () => {
  fc.assert(
    fc.property(
      arbitraryImage({
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
        const description = describeBinaryImage(image, bounds);
        const reconstructed = makeBinaryGrayImage(description);
        assertBinaryImagesEqual(image.crop(bounds), reconstructed);
      }
    )
  );
});

test('makeBinaryGrayImage fails with an invalid description', () => {
  expect(() => makeBinaryGrayImage('invalid')).toThrowError();
});

test('makeBinaryGrayImage fails with mismatching widths', () => {
  expect(() => makeBinaryGrayImage('##\n###')).toThrowError();
});
