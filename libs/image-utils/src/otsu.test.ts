import { createImageData } from 'canvas';
import { wrapImageData } from './image_data';
import { otsu } from './otsu';

test('otsu finds a threshold separating foreground and background', () => {
  expect(
    otsu(
      wrapImageData(
        createImageData(
          Uint8ClampedArray.of(1, 2, 35, 98, 244, 255, 255, 255),
          2,
          4
        )
      )
    )
  ).toEqual(243);
});
