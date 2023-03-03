import { createImageData } from 'canvas';
import { PIXEL_BLACK, PIXEL_WHITE } from './constants';
import { wrapImageData } from './image_data';

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

test('counting pixels', () => {
  expect(imageData4x4.count({ color: PIXEL_BLACK })).toEqual(
    imageData4x4.length - imageData4x4.count({ color: PIXEL_WHITE })
  );

  expect(
    imageData4x4.count({
      color: PIXEL_BLACK,
      bounds: { x: 1, y: 1, width: 1, height: 1 },
    })
  ).toEqual(1);
});
