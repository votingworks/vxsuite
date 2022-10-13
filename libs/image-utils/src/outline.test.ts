import { createImageData } from 'canvas';
import fc from 'fast-check';
import { arbitraryImageData } from '../test/arbitraries';
import {
  assertBinaryImageDatasEqual,
  makeBinaryImageData,
  makeGrayscaleImageData,
} from '../test/utils';
import { countPixels } from './count';
import { PIXEL_BLACK, PIXEL_WHITE } from './diff';
import { embolden, outline } from './outline';

test('outline', () => {
  const original = makeBinaryImageData(
    `
      .....
      ..#..
      .....
    `,
    1
  );
  const step1 = makeBinaryImageData(
    `
      ..#..
      .###.
      ..#..
    `,
    1
  );
  assertBinaryImageDatasEqual(outline(original), step1);

  const step2 = makeBinaryImageData(
    `
      .###.
      #####
      .###.
    `,
    1
  );
  assertBinaryImageDatasEqual(outline(step1), step2);

  const step3 = makeBinaryImageData(
    `
      #####
      #####
      #####
    `,
    1
  );
  assertBinaryImageDatasEqual(outline(step2), step3);
});

test('blank images never change', () => {
  fc.assert(
    fc.property(
      arbitraryImageData({ pixels: fc.constant(PIXEL_WHITE) }),
      (imageData) => {
        const result = outline(imageData);
        assertBinaryImageDatasEqual(result, imageData);
      }
    )
  );
});

test('images never lose pixels of the outlined color', () => {
  fc.assert(
    fc.property(
      arbitraryImageData({
        channels: fc.constantFrom(1, 4),
        pixels: fc.constantFrom(PIXEL_WHITE, PIXEL_BLACK),
      }),
      (imageData) => {
        const result = outline(imageData, { color: PIXEL_BLACK });
        expect(
          countPixels(result, { color: PIXEL_BLACK })
        ).toBeGreaterThanOrEqual(
          countPixels(imageData, { color: PIXEL_BLACK })
        );
      }
    )
  );
});

test.each([1, 4] as const)(
  'embolden with %i-channel binary images',
  (channelCount) => {
    const original = makeBinaryImageData(
      `
      .....
      ..#..
      .....
    `,
      channelCount
    );
    const expected = makeBinaryImageData(
      `
      ..#..
      .###.
      ..#..
    `,
      channelCount
    );
    assertBinaryImageDatasEqual(embolden(original), expected);
  }
);

test('embolden with 1-channel grayscale images', () => {
  const original = makeGrayscaleImageData(
    `
      fed
      cba
      210
    `,
    1
  );
  expect(embolden(original)).toEqual(
    // manually compute the result by darkening each pixel according to the
    // surrounding pixels
    createImageData(
      Uint8ClampedArray.from(
        [
          ...[
            0xff -
              // above
              (0xff - 0xff) -
              // below
              (0xff - 0xcc) -
              // left
              (0xff - 0xff) -
              // right
              (0xff - 0xee),
            0xee -
              // above
              (0xff - 0xff) -
              // below
              (0xff - 0xbb) -
              // left
              (0xff - 0xff) -
              // right
              (0xff - 0xdd),
            0xdd -
              // above
              (0xff - 0xff) -
              // below
              (0xff - 0xaa) -
              // left
              (0xff - 0xee) -
              // right
              (0xff - 0xff),
          ],
          ...[
            0xcc -
              // above
              (0xff - 0xff) -
              // below
              (0xff - 0x22) -
              // left
              (0xff - 0xff) -
              // right
              (0xff - 0xbb),
            0xbb -
              // above
              (0xff - 0xee) -
              // below
              (0xff - 0x11) -
              // left
              (0xff - 0xcc) -
              // right
              (0xff - 0xaa),
            0xaa -
              // above
              (0xff - 0xdd) -
              // below
              (0xff - 0x00) -
              // left
              (0xff - 0xbb) -
              // right
              (0xff - 0xff),
          ],
          ...[
            0x22 -
              // above
              (0xff - 0xcc) -
              // below
              (0xff - 0xff) -
              // left
              (0xff - 0xff) -
              // right
              (0xff - 0x11),
            0x11 -
              // above
              (0xff - 0xbb) -
              // below
              (0xff - 0xff) -
              // left
              (0xff - 0x22) -
              // right
              (0xff - 0x00),
            0x00 -
              // above
              (0xff - 0xaa) -
              // below
              (0xff - 0xff) -
              // left
              (0xff - 0x11) -
              // right
              (0xff - 0xff),
          ],
        ].map((v) => Math.max(v, 0x00))
      ),
      original.width,
      original.height
    )
  );
});
