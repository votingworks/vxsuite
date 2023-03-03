import { Rect } from '@votingworks/types';
import { createImageData } from 'canvas';
import fc from 'fast-check';
import { arbitraryImage, arbitraryRect } from '../test/arbitraries';
import { B, F, makeBinaryGrayImage } from '../test/utils';
import { wrapImageData } from './image_data';
import { AnyImage, int } from './types';

/**
 * A slow-but-accurate implementation of `crop` to compare against.
 */
function cropReferenceImplementation<I extends AnyImage>(
  image: I,
  bounds: Rect
): I {
  const { data: src, width: srcWidth, height: srcHeight } = image.asImageData();
  const channels = src.length / (srcWidth * srcHeight);
  const dst = new Uint8ClampedArray(bounds.width * bounds.height * channels);
  const {
    x: srcOffsetX,
    y: srcOffsetY,
    width: dstWidth,
    height: dstHeight,
  } = bounds;

  for (let y = 0; y < dstHeight; y += 1) {
    const srcY = srcOffsetY + y;

    for (let x = 0; x < dstWidth; x += 1) {
      const srcX = srcOffsetX + x;
      const srcOffset = (srcX + srcY * srcWidth) * channels;
      const dstOffset = (x + y * dstWidth) * channels;

      for (let c = 0; c < channels; c += 1) {
        dst[dstOffset + c] = src[srcOffset + c] as int;
      }
    }
  }

  return wrapImageData(createImageData(dst, dstWidth, dstHeight)) as I;
}

test('crop center (gray)', () => {
  const image = makeBinaryGrayImage(`
    ###
    #.#
    ###
  `);

  const { data, width, height } = image
    .crop({ x: 1, y: 1, width: 1, height: 1 })
    .asImageData();
  expect([...data]).toEqual([B]);
  expect({ width, height }).toEqual({ width: 1, height: 1 });
});

test('crop center (rgba)', () => {
  const imageData = makeBinaryGrayImage(`
    ###
    #.#
    ###
  `).toRgba();

  const { data, width, height } = imageData
    .crop({ x: 1, y: 0, width: 1, height: 1 })
    .asImageData();
  expect([...data]).toEqual([F, 0, 0, 255]);
  expect({ width, height }).toEqual({ width: 1, height: 1 });
});

test('crop random', () => {
  fc.assert(
    fc.property(
      arbitraryImage().chain((image) =>
        fc.record({
          image: fc.constant(image),
          bounds: arbitraryRect({
            maxX: image.width - 1,
            maxY: image.height - 1,
          }),
        })
      ),
      ({ image, bounds }) => {
        const cropped = image.crop(bounds);
        const { width, height } = cropped;
        expect(cropped.asImageData()).toEqual(
          cropReferenceImplementation(image, bounds).asImageData()
        );
        expect({ width, height }).toEqual({
          width: bounds.width,
          height: bounds.height,
        });
      }
    )
  );
});
