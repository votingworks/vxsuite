import { Buffer } from 'buffer';
import { ImageData, createImageData } from 'canvas';
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
  ensureImageData,
  toImageBuffer,
} from './image_data';

test('channels', () => {
  const rgbaImage = createImageData(1, 1);
  const rgbImage = createImageData(Uint8ClampedArray.of(0, 0, 0), 1, 1);
  const grayImage = createImageData(Uint8ClampedArray.of(0), 1, 1);

  expect(getImageChannelCount(rgbaImage)).toEqual(RGBA_CHANNEL_COUNT);
  expect(getImageChannelCount(grayImage)).toEqual(GRAY_CHANNEL_COUNT);
  expect(getImageChannelCount(rgbImage)).toEqual(RGB_CHANNEL_COUNT);

  expect(isRgba(rgbaImage)).toEqual(true);
  expect(isRgba(grayImage)).toEqual(false);
  expect(isRgba(rgbImage)).toEqual(false);
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
        expect(getImageChannelCount(imageData)).toEqual(channels);
        expect(isGrayscale(imageData)).toEqual(channels === GRAY_CHANNEL_COUNT);
        expect(isRgba(imageData)).toEqual(channels === RGBA_CHANNEL_COUNT);
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

test('loadImageData with invalid PGM format', async () => {
  const filePath = fileSync({
    template: `tmp-XXXXXX.pgm`,
  }).name;
  await writeFile(filePath, `P5\n0\n255\n`);
  await expect(loadImageData(filePath)).rejects.toThrow(
    new Error(`Invalid PGM image: ${filePath}`)
  );
});

test('loadImage/loadImageData with PGM format', async () => {
  await fc.assert(
    fc.asyncProperty(arbitraryImageData({ channels: 1 }), async (imageData) => {
      const filePath = fileSync({
        template: `tmp-XXXXXX.pgm`,
      }).name;
      const pgmData = Buffer.concat([
        Buffer.from('P5\n'),
        Buffer.from(`${imageData.width} ${imageData.height}\n`),
        Buffer.from('255\n'),
        Buffer.from(imageData.data),
      ]);

      await writeFile(filePath, pgmData);

      const loadedImageFromFile = await loadImage(filePath);
      const loadedImageDataFromFile = await loadImageData(filePath);
      expect({
        width: loadedImageDataFromFile.width,
        height: loadedImageDataFromFile.height,
      }).toEqual({
        width: imageData.width,
        height: imageData.height,
      });
      expect({
        width: loadedImageFromFile.width,
        height: loadedImageFromFile.height,
      }).toEqual({
        width: imageData.width,
        height: imageData.height,
      });

      const pgmDataUrl = toDataUrl(imageData, 'image/x-portable-graymap');
      const loadedImageFromDataUrl = await loadImage(pgmDataUrl);
      const loadedImageDataFromDataUrl = await loadImageData(pgmDataUrl);
      expect({
        width: loadedImageDataFromDataUrl.width,
        height: loadedImageDataFromDataUrl.height,
      }).toEqual({
        width: imageData.width,
        height: imageData.height,
      });
      expect({
        width: loadedImageFromDataUrl.width,
        height: loadedImageFromDataUrl.height,
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
          expect(toRgba(imageData).unsafeUnwrap()).toEqual(imageData);
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
          expect(toGrayscale(imageData).unsafeUnwrap()).toEqual(imageData);
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

test('toDataUrl image/x-portable-graymap', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryImageData({ width: 5, height: 5, channels: 1 }),
      async (imageData) => {
        const dataUrl = toDataUrl(imageData, 'image/x-portable-graymap');
        expect(dataUrl).toMatch(/^data:image\/x-portable-graymap;base64,/);
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

test('toDataUrl image/x-portable-graymap with more than one channel', () => {
  const imageData = createImageData(5, 5);
  expect(getImageChannelCount(imageData)).toEqual(4);
  expect(() => toDataUrl(imageData, 'image/x-portable-graymap')).toThrow(
    'image/x-portable-graymap only supports one channel'
  );
});

test('ensureImageData', () => {
  const imageData = createImageData(1, 1);
  expect(ensureImageData(imageData) === imageData).toBeTruthy();
  expect(ensureImageData(imageData)).toBeInstanceOf(ImageData);

  const imageDataLike: ImageData = {
    width: 1,
    height: 1,
    data: Uint8ClampedArray.of(0),
    colorSpace: 'srgb',
  };
  expect(ensureImageData(imageDataLike) === imageDataLike).toBeFalsy();
  expect(ensureImageData(imageDataLike)).toBeInstanceOf(ImageData);
});

test('toImageBuffer', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryImageData({ width: 5, height: 5, channels: 4 }),
      fc.constantFrom<'png' | 'jpeg' | undefined>('png', 'jpeg', undefined),
      async (imageData, format) => {
        const buffer = toImageBuffer(imageData, format && `image/${format}`);
        const filePath = fileSync({ template: `tmp-XXXXXX.${format}` }).name;
        await writeFile(filePath, buffer);
        const { width: decodedWidth, height: decodedHeight } = toImageData(
          await loadImage(filePath)
        );
        expect({ width: decodedWidth, height: decodedHeight }).toStrictEqual({
          width: imageData.width,
          height: imageData.height,
        });
      }
    )
  );
});
