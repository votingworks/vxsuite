import { Buffer } from 'buffer';
import { createImageData } from 'canvas';
import fc from 'fast-check';
import { writeFile } from 'fs/promises';
import { fileSync } from 'tmp';
import {
  arbitraryImage,
  arbitraryImageData,
  arbitraryRgbaImage,
} from '../test/arbitraries';
import { makeBinaryGrayImage } from '../test/utils';
import {
  getImageChannelCount,
  GRAY_CHANNEL_COUNT,
  loadImage,
  RGBA_CHANNEL_COUNT,
  wrapImageData,
  writeImage,
} from './image_data';

test('channels', () => {
  const rgbaImage = wrapImageData(createImageData(1, 1));
  const grayImage = wrapImageData(
    createImageData(Uint8ClampedArray.of(0), 1, 1)
  );

  expect(rgbaImage.channels).toEqual(RGBA_CHANNEL_COUNT);
  expect(grayImage.channels).toEqual(GRAY_CHANNEL_COUNT);

  expect(rgbaImage.isRgba()).toEqual(true);
  expect(grayImage.isRgba()).toEqual(false);

  expect(rgbaImage.isGray()).toEqual(false);
  expect(grayImage.isGray()).toEqual(true);
});

test('loadImage/writeImage', async () => {
  await expect(
    writeImage('/path/does/not/exist.png', makeBinaryGrayImage('.'))
  ).rejects.toMatchObject({ code: 'ENOENT' });

  await expect(
    writeImage('/path/does/not/exist.jpeg', makeBinaryGrayImage('.'))
  ).rejects.toMatchObject({ code: 'ENOENT' });

  await fc.assert(
    fc.asyncProperty(
      arbitraryRgbaImage(),
      fc.constantFrom('png', 'jpeg', 'jpg'),
      async (image, format) => {
        const filePath = fileSync({ template: `tmp-XXXXXX.${format}` }).name;
        await writeImage(filePath, image);
        const loadedImage = await loadImage(filePath);
        expect({
          width: loadedImage.width,
          height: loadedImage.height,
          dataLength: loadedImage.length,
        }).toEqual({
          width: image.width,
          height: image.height,
          dataLength: image.length,
        });
      }
    )
  );
});

test('loadImage with invalid PGM format', async () => {
  const filePath = fileSync({
    template: `tmp-XXXXXX.pgm`,
  }).name;
  await writeFile(filePath, `P5\n0\n255\n`);
  await expect(loadImage(filePath)).rejects.toThrow(
    new Error(`Invalid PGM image: ${filePath}`)
  );
});

test('loadImage with PGM format', async () => {
  await fc.assert(
    fc.asyncProperty(arbitraryImage({ channels: 1 }), async (image) => {
      const pgmDataUrl = image.asDataUrl('image/x-portable-graymap');
      const loadedImageFromDataUrl = await loadImage(pgmDataUrl);
      expect({
        width: loadedImageFromDataUrl.width,
        height: loadedImageFromDataUrl.height,
      }).toEqual({
        width: image.width,
        height: image.height,
      });
    })
  );
});

test('loadImage', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryRgbaImage(),
      fc.constantFrom('png', 'jpeg', 'jpg'),
      async (image, format) => {
        const filePath = fileSync({ template: `tmp-XXXXXX.${format}` }).name;
        await writeImage(filePath, image);
        const loadedImage = await loadImage(filePath);
        expect({
          width: loadedImage.width,
          height: loadedImage.height,
          dataLength: loadedImage.length,
        }).toEqual({
          width: image.width,
          height: image.height,
          dataLength: image.length,
        });
      }
    )
  );
});

test('toRgba', () => {
  fc.assert(
    fc.property(arbitraryImage(), (image) => {
      if (image.channels === RGBA_CHANNEL_COUNT) {
        expect(image.toRgba().asImageData()).toEqual(image.asImageData());
      } else if (image.channels === GRAY_CHANNEL_COUNT) {
        expect(image.toRgba()).toHaveLength(image.width * image.height);
      }
    })
  );
});

test('toGray', () => {
  fc.assert(
    fc.property(arbitraryImage(), (image) => {
      if (image.channels === GRAY_CHANNEL_COUNT) {
        expect(image.toGray().asImageData()).toEqual(image.asImageData());
      } else if (image.channels === RGBA_CHANNEL_COUNT) {
        expect(image.toGray()).toHaveLength(
          image.width * image.height * GRAY_CHANNEL_COUNT
        );
      }
    })
  );
});

test('toDataUrl image/png', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryImage({ width: 5, height: 5, channels: 4 }),
      async (image) => {
        const dataUrl = image.asDataUrl('image/png');
        expect(dataUrl).toMatch(/^data:image\/png;base64,/);
        const { width: decodedWidth, height: decodedHeight } = await loadImage(
          dataUrl
        );
        expect({ width: decodedWidth, height: decodedHeight }).toStrictEqual({
          width: image.width,
          height: image.height,
        });
      }
    )
  );
});

test('toDataUrl image/jpeg', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryImage({ width: 5, height: 5, channels: 4 }),
      async (image) => {
        const dataUrl = image.asDataUrl('image/jpeg');
        expect(dataUrl).toMatch(/^data:image\/jpeg;base64,/);
        const { width: decodedWidth, height: decodedHeight } = await loadImage(
          dataUrl
        );
        expect({ width: decodedWidth, height: decodedHeight }).toStrictEqual({
          width: image.width,
          height: image.height,
        });
      }
    )
  );
});

test('toDataUrl image/x-portable-graymap', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryImage({ width: 5, height: 5, channels: 1 }),
      async (image) => {
        const dataUrl = image.asDataUrl('image/x-portable-graymap');
        expect(dataUrl).toMatch(/^data:image\/x-portable-graymap;base64,/);
        const { width: decodedWidth, height: decodedHeight } = await loadImage(
          dataUrl
        );
        expect({ width: decodedWidth, height: decodedHeight }).toStrictEqual({
          width: image.width,
          height: image.height,
        });
      }
    )
  );
});
