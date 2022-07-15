import { createImageData } from 'canvas';
import fc from 'fast-check';
import { arbitraryImageData } from '../test/arbitraries';
import { rotate180 } from './rotate';

test('rotate180', () => {
  const imageData = createImageData(
    Uint8ClampedArray.from([
      ...[0, 0, 0, 255, 1, 2, 3, 255, 7, 8, 9, 255],
      ...[0, 0, 0, 255, 3, 2, 1, 255, 0, 0, 0, 255],
      ...[4, 5, 6, 255, 0, 0, 0, 255, 0, 0, 0, 255],
    ]),
    3,
    3
  );

  rotate180(imageData);

  expect(imageData.data).toEqual(
    Uint8ClampedArray.from([
      ...[0, 0, 0, 255, 0, 0, 0, 255, 4, 5, 6, 255],
      ...[0, 0, 0, 255, 3, 2, 1, 255, 0, 0, 0, 255],
      ...[7, 8, 9, 255, 1, 2, 3, 255, 0, 0, 0, 255],
    ])
  );
});

test('rotate180 twice returns the original image', () => {
  fc.assert(
    fc.property(arbitraryImageData(), (imageData) => {
      const rotated = createImageData(
        imageData.data,
        imageData.width,
        imageData.height
      );
      rotate180(rotated);
      rotate180(rotated);
      expect(rotated).toEqual(imageData);
    })
  );
});
