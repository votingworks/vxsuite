import fc from 'fast-check';
import { arbitraryImageData } from '../test/arbitraries';
import {
  assertBinaryImageDatasEqual,
  makeBinaryImageData,
} from '../test/utils';
import { binarize } from './binarize';

test('grayscale input, binarized output', () => {
  fc.assert(
    fc.property(
      arbitraryImageData({ channels: 1 }),
      fc.integer({ min: 0, max: 255 }),
      (image, threshold) => {
        const binarized = binarize(image, threshold);
        expect(binarized.width).toBe(image.width);
        expect(binarized.height).toBe(image.height);
        expect(binarized.data.length).toBe(image.data.length);
        for (let i = 0; i < image.data.length; i += 1) {
          expect(binarized.data[i]).toBe(image.data[i]! > threshold ? 255 : 0);
        }
      }
    )
  );
});

test.each([1, 4] as const)(
  'already-binarized image with %s channels',
  (channelCount) => {
    const allBackground = makeBinaryImageData(
      `
        ......
        ......
        ......
      `,
      channelCount
    );

    assertBinaryImageDatasEqual(binarize(allBackground), allBackground);

    const allForeground = makeBinaryImageData(
      `
        ######
        ######
        ######
      `,
      channelCount
    );

    assertBinaryImageDatasEqual(binarize(allForeground), allForeground);
  }
);
