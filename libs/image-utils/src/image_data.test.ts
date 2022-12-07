import { createImageData } from 'canvas';
import fc from 'fast-check';
import { writeFile } from 'fs/promises';
import { fileSync } from 'tmp';
import {
  arbitraryImageData,
  arbitraryImageDataRgba,
} from '../test/arbitraries';
import {
  getImageChannelCount,
  GRAY_CHANNEL_COUNT,
  isGrayscale,
  isRgba,
  loadImage,
  loadImageData,
  RGBA_CHANNEL_COUNT,
  RGB_CHANNEL_COUNT,
  toDataUrl,
  toGrayscale,
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
  await expect(
    writeImageData('/path/does/not/exist.png', createImageData(1, 1))
  ).rejects.toMatchObject({ code: 'ENOENT' });

  await expect(
    writeImageData('/path/does/not/exist.jpeg', createImageData(1, 1))
  ).rejects.toMatchObject({ code: 'ENOENT' });

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

test('loadImage with invalid RAW filename', async () => {
  await expect(loadImage('invalid.raw')).rejects.toThrowError(
    'Invalid raw image filename'
  );
});

test('loadImage/loadImageData with RAW format', async () => {
  await fc.assert(
    fc.asyncProperty(arbitraryImageData(), async (imageData) => {
      const bitsPerPixel = getImageChannelCount(imageData) * 8;
      const filePath = fileSync({
        template: `tmp-XXXXXX-${imageData.width}x${imageData.height}-${bitsPerPixel}bpp.raw`,
      }).name;
      await writeFile(filePath, imageData.data);
      const loadedImage = await loadImage(filePath);
      const loadedImageData = await loadImageData(filePath);
      expect({
        width: loadedImageData.width,
        height: loadedImageData.height,
      }).toEqual({
        width: imageData.width,
        height: imageData.height,
      });
      expect({
        width: loadedImage.width,
        height: loadedImage.height,
      }).toEqual({
        width: imageData.width,
        height: imageData.height,
      });
    })
  );
});

test('loadImageData', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryImageDataRgba(),
      fc.constantFrom('png', 'jpeg', 'jpg'),
      async (imageData, format) => {
        const filePath = fileSync({ template: `tmp-XXXXXX.${format}` }).name;
        await writeImageData(filePath, imageData);
        const loadedImageData = await loadImageData(filePath);
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

test('toGrayscale', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 10 }).chain((channels) =>
        fc.record({
          channels: fc.constant(channels),
          imageData: arbitraryImageData({ channels }),
        })
      ),
      ({ channels, imageData }) => {
        if (channels === GRAY_CHANNEL_COUNT) {
          expect(toGrayscale(imageData).unsafeUnwrap()).toBe(imageData);
        } else if (channels === RGBA_CHANNEL_COUNT) {
          expect(toGrayscale(imageData).unsafeUnwrap().data).toHaveLength(
            imageData.width * imageData.height * GRAY_CHANNEL_COUNT
          );
        } else {
          toGrayscale(imageData).unsafeUnwrapErr();
        }
      }
    )
  );
});

test('toDataUrl image/png', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryImageData({ width: 5, height: 5, channels: 4 }),
      async (imageData) => {
        const dataUrl = toDataUrl(imageData, 'image/png');
        expect(dataUrl).toMatch(/^data:image\/png;base64,/);
        const { width: decodedWidth, height: decodedHeight } = toImageData(
          await loadImage(dataUrl)
        );
        expect({ width: decodedWidth, height: decodedHeight }).toStrictEqual({
          width: imageData.width,
          height: imageData.height,
        });
      }
    )
  );
});

test('toDataUrl image/jpeg', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryImageData({ width: 5, height: 5, channels: 4 }),
      async (imageData) => {
        const dataUrl = toDataUrl(imageData, 'image/jpeg');
        expect(dataUrl).toMatch(/^data:image\/jpeg;base64,/);
        const { width: decodedWidth, height: decodedHeight } = toImageData(
          await loadImage(dataUrl)
        );
        expect({ width: decodedWidth, height: decodedHeight }).toStrictEqual({
          width: imageData.width,
          height: imageData.height,
        });
      }
    )
  );
});
