import fc from 'fast-check';
import { arbitraryGrayImage } from '../test/arbitraries';
import { assertBinaryImagesEqual, makeBinaryGrayImage } from '../test/utils';

test('grayscale input, binarized output', () => {
  fc.assert(
    fc.property(
      arbitraryGrayImage(),
      fc.integer({ min: 0, max: 255 }),
      (image, threshold) => {
        const binarized = image.binarize(threshold);
        expect(binarized.width).toEqual(image.width);
        expect(binarized.height).toEqual(image.height);
        expect(binarized.length).toEqual(image.length);
        for (let i = 0; i < image.length; i += 1) {
          expect(binarized.raw(i)).toEqual(image.raw(i) > threshold ? 255 : 0);
        }
      }
    )
  );
});

test('already-binarized image', () => {
  const allBackground = makeBinaryGrayImage(
    `
        ......
        ......
        ......
      `
  );

  assertBinaryImagesEqual(allBackground.binarize(), allBackground);

  const allForeground = makeBinaryGrayImage(
    `
        ######
        ######
        ######
      `
  );

  assertBinaryImagesEqual(allForeground.binarize(), allForeground);
});
