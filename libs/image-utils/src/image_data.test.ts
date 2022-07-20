import { createImageData } from 'canvas';
import fc from 'fast-check';
import { fileSync } from 'tmp';
import {
  arbitraryImageData,
  arbitraryImageDataRgba,
} from '../test/arbitraries';
import {
  getImageChannelCount,
  GRAY_CHANNEL_COUNT,
  ImageProcessingErrorKind,
  isGrayscale,
  isRgba,
  loadImage,
  RGBA_CHANNEL_COUNT,
  RGB_CHANNEL_COUNT,
  toImageData,
  toRgba,
  writeImageData,
} from './image_data';

test('channels', () => {
  const rgbaImage = createImageData(1, 1);
  const rgbImage = createImageData(Uint8ClampedArray.of(0, 0, 0), 1, 1);
  const grayImage = createImageData(Uint8ClampedArray.of(0), 1, 1);

  expect(getImageChannelCount(rgbaImage)).toBe(RGBA_CHANNEL_COUNT);
  expect(getImageChannelCount(grayImage)).toBe(GRAY_CHANNEL_COUNT);
  expect(getImageChannelCount(rgbImage)).toBe(RGB_CHANNEL_COUNT);

  expect(isRgba(rgbaImage)).toBe(true);
  expect(isRgba(grayImage)).toBe(false);
  expect(isRgba(rgbImage)).toBe(false);
});

test('getImageChannelCount always returns an integer', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 10 }).chain((channels) =>
        fc.record({
          channels: fc.constant(channels),
          imageData: arbitraryImageData({ channels }),
        })
      ),
      ({ channels, imageData }) => {
        expect(getImageChannelCount(imageData)).toBe(channels);
        expect(isGrayscale(imageData)).toBe(channels === GRAY_CHANNEL_COUNT);
        expect(isRgba(imageData)).toBe(channels === RGBA_CHANNEL_COUNT);
      }
    )
  );
});

test('loadImage/writeImageData', async () => {
  expect(
    (
      await writeImageData('unsupported-format.bmp', createImageData(1, 1))
    ).unsafeUnwrapErr()
  ).toStrictEqual({
    kind: ImageProcessingErrorKind.UnsupportedImageFormat,
    format: '.bmp',
  });

  expect(
    (
      await writeImageData('/path/does/not/exist.png', createImageData(1, 1))
    ).unsafeUnwrapErr()
  ).toStrictEqual({
    kind: ImageProcessingErrorKind.WriteError,
    error: expect.objectContaining({ code: 'ENOENT' }),
  });

  expect(
    (
      await writeImageData('/path/does/not/exist.jpeg', createImageData(1, 1))
    ).unsafeUnwrapErr()
  ).toStrictEqual({
    kind: ImageProcessingErrorKind.WriteError,
    error: expect.objectContaining({ code: 'ENOENT' }),
  });

  await fc.assert(
    fc.asyncProperty(
      arbitraryImageDataRgba(),
      fc.constantFrom('png', 'jpeg', 'jpg'),
      async (imageData, format) => {
        const filePath = fileSync({ template: `tmp-XXXXXX.${format}` }).name;
        await writeImageData(filePath, imageData);
        const loadedImageData = toImageData(await loadImage(filePath));
        expect({
          width: loadedImageData.width,
          height: loadedImageData.height,
          dataLength: loadedImageData.data.length,
        }).toEqual({
          width: imageData.width,
          height: imageData.height,
          dataLength: imageData.data.length,
        });
      }
    )
  );
});

test('toRgba', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 10 }).chain((channels) =>
        fc.record({
          channels: fc.constant(channels),
          imageData: arbitraryImageData({ channels }),
        })
      ),
      ({ channels, imageData }) => {
        if (channels === RGBA_CHANNEL_COUNT) {
          expect(toRgba(imageData).unsafeUnwrap()).toBe(imageData);
        } else if (channels === GRAY_CHANNEL_COUNT) {
          expect(toRgba(imageData).unsafeUnwrap().data).toHaveLength(
            imageData.width * imageData.height * RGBA_CHANNEL_COUNT
          );
        } else {
          toRgba(imageData).unsafeUnwrapErr();
        }
      }
    )
  );
});
