import { createImageData } from 'canvas';
import fc from 'fast-check';
import { arbitraryImageData } from '../test/arbitraries';
import {
  assertBinaryImageDatasEqual,
  makeBinaryImageData,
} from '../test/utils';
import { dither } from './dither';

test('binary image dithers to itself', () => {
  fc.assert(
    fc.property(
      arbitraryImageData({
        width: 4,
        height: 4,
        channels: 1,
        pixels: fc.constantFrom(0, 255),
      }),
      (monochromeImageData) => {
        assertBinaryImageDatasEqual(
          dither(monochromeImageData).assertOk('dithering failed').imageData,
          monochromeImageData
        );
      }
    )
  );
});

test('grayscale image dithers to binary image', () => {
  fc.assert(
    fc.property(
      arbitraryImageData({
        width: 4,
        height: 4,
        channels: 1,
      }),
      (grayscaleImageData) => {
        const dithered =
          dither(grayscaleImageData).assertOk('dithering failed').imageData;
        for (let y = 0, offset = 0; y < dithered.height; y += 1) {
          for (let x = 0; x < dithered.width; x += 1, offset += 1) {
            if (dithered.data[offset] !== 0) {
              expect(dithered.data[offset]).toEqual(255);
            }
          }
        }
      }
    )
  );
});

test('RGBA image dithers to binary image', () => {
  fc.assert(
    fc.property(
      arbitraryImageData({
        width: 4,
        height: 4,
        channels: 4,
      }),
      (rgbaImageData) => {
        const dithered =
          dither(rgbaImageData).assertOk('dithering failed').imageData;
        for (let y = 0, offset = 0; y < dithered.height; y += 1) {
          for (let x = 0; x < dithered.width; x += 1, offset += 1) {
            if (dithered.data[offset] !== 0) {
              expect(dithered.data[offset]).toEqual(255);
            }
          }
        }
      }
    )
  );
});

test('RGB image is unhandled', () => {
  fc.assert(
    fc.property(
      arbitraryImageData({
        width: 4,
        height: 4,
        channels: 3,
      }),
      (rgbImageData) => {
        dither(rgbImageData).unsafeUnwrapErr();
      }
    )
  );
});

test('custom threshold', () => {
  const imageData = createImageData(4, 4);
  const ditheredImage = dither(imageData, { threshold: 255 }).assertOk(
    'dithering failed'
  );
  assertBinaryImageDatasEqual(
    ditheredImage.imageData,
    makeBinaryImageData(`
      ####
      ####
      ####
      ####
    `)
  );
});
