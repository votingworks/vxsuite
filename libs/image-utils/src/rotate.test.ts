import { createImageData } from 'canvas';
import fc from 'fast-check';
import { arbitraryImage, arbitraryImageData } from '../test/arbitraries';
import { wrapImageData } from './image_data';
import { rotate180 } from './rotate';

test('rotate180', () => {
  const imageData = wrapImageData(
    createImageData(
      Uint8ClampedArray.from([
        ...[0, 0, 0, 255, 1, 2, 3, 255, 7, 8, 9, 255],
        ...[0, 0, 0, 255, 3, 2, 1, 255, 0, 0, 0, 255],
        ...[4, 5, 6, 255, 0, 0, 0, 255, 0, 0, 0, 255],
      ]),
      3,
      3
    )
  ).toRgba();

  const rotated = imageData.rotate180();

  expect(rotated.asImageData().data).toEqual(
    Uint8ClampedArray.from([
      ...[0, 0, 0, 255, 0, 0, 0, 255, 4, 5, 6, 255],
      ...[0, 0, 0, 255, 3, 2, 1, 255, 0, 0, 0, 255],
      ...[7, 8, 9, 255, 1, 2, 3, 255, 0, 0, 0, 255],
    ])
  );
});

test('rotate180 twice returns the original image', () => {
  fc.assert(
    fc.property(arbitraryImage(), (image) => {
      expect(image.rotate180().rotate180().asImageData()).toEqual(
        image.asImageData()
      );
    })
  );
});
