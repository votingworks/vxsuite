import fc from 'fast-check';
import { arbitraryGrayImage } from '../test/arbitraries';
import { assertBinaryImagesEqual, makeBinaryGrayImage } from '../test/utils';
import { PIXEL_BLACK, PIXEL_WHITE } from './constants';

test('outline', () => {
  const original = makeBinaryGrayImage(
    `
      .....
      ..#..
      .....
    `
  );
  const step1 = makeBinaryGrayImage(
    `
      ..#..
      .###.
      ..#..
    `
  );
  assertBinaryImagesEqual(original.outline({ color: PIXEL_BLACK }), step1);

  const step2 = makeBinaryGrayImage(
    `
      .###.
      #####
      .###.
    `
  );
  assertBinaryImagesEqual(step1.outline({ color: PIXEL_BLACK }), step2);

  const step3 = makeBinaryGrayImage(
    `
      #####
      #####
      #####
    `
  );
  assertBinaryImagesEqual(step2.outline({ color: PIXEL_BLACK }), step3);
});

test('blank images never change', () => {
  fc.assert(
    fc.property(
      arbitraryGrayImage({ pixels: fc.constant(PIXEL_WHITE) }),
      (imageData) => {
        const result = imageData.outline({ color: PIXEL_BLACK });
        assertBinaryImagesEqual(result, imageData);
      }
    )
  );
});

test('images never lose pixels of the outlined color', () => {
  fc.assert(
    fc.property(
      arbitraryGrayImage({
        pixels: fc.constantFrom(PIXEL_WHITE, PIXEL_BLACK),
      }),
      (image) => {
        const result = image.outline({ color: PIXEL_BLACK });
        expect(result.count({ color: PIXEL_BLACK })).toBeGreaterThanOrEqual(
          image.count({ color: PIXEL_BLACK })
        );
      }
    )
  );
});
