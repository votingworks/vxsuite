import { Rect } from '@votingworks/types';
import { createImageData } from 'canvas';
import { countPixels, ratio } from './count';
import { PIXEL_BLACK, PIXEL_WHITE } from './diff';

const imageData4x4: Readonly<ImageData> = createImageData(
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
);

test('ratio', () => {
  // 4 black pixels, 12 white pixels
  expect(ratio(imageData4x4)).toBe(4 / 16);
  expect(ratio(imageData4x4, { color: PIXEL_WHITE })).toBe(12 / 16);

  // 2 black pixels, 2 white pixels
  const topCornerBounds: Rect = { x: 0, y: 0, width: 2, height: 2 };
  expect(ratio(imageData4x4, { bounds: topCornerBounds })).toBe(2 / 4);
  expect(
    ratio(imageData4x4, {
      bounds: topCornerBounds,
      color: PIXEL_WHITE,
    })
  ).toBe(2 / 4);
});

test('counting pixels', () => {
  expect(countPixels(imageData4x4)).toEqual(
    countPixels(imageData4x4, { color: PIXEL_BLACK })
  );

  expect(countPixels(imageData4x4, { color: PIXEL_WHITE })).toEqual(
    imageData4x4.data.length - countPixels(imageData4x4, { color: PIXEL_BLACK })
  );

  expect(
    countPixels(imageData4x4, {
      color: PIXEL_BLACK,
      bounds: { x: 1, y: 1, width: 1, height: 1 },
    })
  ).toEqual(1);
});
