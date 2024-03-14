import { ImageData } from '@napi-rs/canvas';
import fc from 'fast-check';
import { writeFile } from 'fs/promises';
import { fileSync } from 'tmp';
import { arbitraryImageData } from '../test/arbitraries';
import {
  RGBA_CHANNEL_COUNT,
  ensureImageData,
  getImageChannelCount,
  isRgba,
  loadImage,
  loadImageData,
  toDataUrl,
  toImageBuffer,
  toImageData,
  writeImageData,
} from './image_data';

test('channels', () => {
  const rgbaImage = new ImageData(1, 1);
  expect(getImageChannelCount(rgbaImage)).toEqual(RGBA_CHANNEL_COUNT);
  expect(isRgba(rgbaImage)).toEqual(true);
});

test('getImageChannelCount always returns an integer', () => {
  fc.assert(
    fc.property(arbitraryImageData(), (imageData) => {
      expect(getImageChannelCount(imageData)).toEqual(RGBA_CHANNEL_COUNT);
    })
  );
});

test('loadImage/writeImageData', async () => {
  await expect(
    writeImageData('/path/does/not/exist.png', new ImageData(1, 1))
  ).rejects.toMatchObject({ code: 'ENOENT' });

  await expect(
    writeImageData('/path/does/not/exist.jpeg', new ImageData(1, 1))
  ).rejects.toMatchObject({ code: 'ENOENT' });

  await fc.assert(
    fc.asyncProperty(
      arbitraryImageData(),
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

test('loadImageData', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryImageData(),
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

test('toDataUrl image/png', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryImageData({ width: 5, height: 5 }),
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
      arbitraryImageData({ width: 5, height: 5 }),
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

test('ensureImageData', () => {
  const imageData = new ImageData(1, 1);
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
      arbitraryImageData({ width: 5, height: 5 }),
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
