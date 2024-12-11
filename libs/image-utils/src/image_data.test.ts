import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { ImageData, createImageData } from 'canvas';
import fc from 'fast-check';
import { writeFile } from 'node:fs/promises';
import { fileSync } from 'tmp';
import { randomFillSync } from 'node:crypto';
import { MaybePromise } from '@votingworks/basics';
import { arbitraryImageData } from '../test/arbitraries';
import {
  RGBA_CHANNEL_COUNT,
  encodeImageData,
  ensureImageData,
  fromGrayScale,
  getImageChannelCount,
  isRgba,
  loadImageData,
  toDataUrl,
  toImageBuffer,
  writeImageData,
} from './image_data';

test('channels', () => {
  const rgbaImage = createImageData(1, 1);
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

test('fromGrayScale', () => {
  expect(() => fromGrayScale(Buffer.of(0), 0, 1)).toThrow('Invalid width');
  expect(() => fromGrayScale(Buffer.of(0), 1, 0)).toThrow('Invalid height');
  expect(() => fromGrayScale(Buffer.of(0), 1, 2)).toThrow(
    'Invalid pixel count'
  );

  // accepts a Buffer
  expect(fromGrayScale(Buffer.of(0), 1, 1)).toBeInstanceOf(ImageData);

  // accepts a Uint8ClampedArray
  expect(fromGrayScale(Uint8ClampedArray.of(0), 1, 1)).toBeInstanceOf(
    ImageData
  );

  // accepts a number[]
  expect(fromGrayScale([0], 1, 1)).toBeInstanceOf(ImageData);

  fc.assert(
    fc.property(
      fc
        .tuple(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 10 }))
        .chain(([width, height]) =>
          fc.tuple(
            fc.array(fc.integer({ min: 0, max: 0xff }), {
              minLength: width * height,
              maxLength: width * height,
            }),
            fc.constant(width),
            fc.constant(height)
          )
        ),
      ([pixels, width, height]) => {
        const imageData = fromGrayScale(pixels, width, height);
        expect({
          width: imageData.width,
          height: imageData.height,
          dataLength: imageData.data.length,
        }).toEqual({
          width,
          height,
          dataLength: width * height * RGBA_CHANNEL_COUNT,
        });

        for (const [i, pixel] of pixels.entries()) {
          expect(imageData.data[i * RGBA_CHANNEL_COUNT]).toEqual(pixel);
          expect(imageData.data[i * RGBA_CHANNEL_COUNT + 1]).toEqual(pixel);
          expect(imageData.data[i * RGBA_CHANNEL_COUNT + 2]).toEqual(pixel);
          expect(imageData.data[i * RGBA_CHANNEL_COUNT + 3]).toEqual(0xff);
        }
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
        const { width: decodedWidth, height: decodedHeight } =
          await loadImageData(dataUrl);
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
        const { width: decodedWidth, height: decodedHeight } =
          await loadImageData(dataUrl);
        expect({ width: decodedWidth, height: decodedHeight }).toStrictEqual({
          width: imageData.width,
          height: imageData.height,
        });
      }
    )
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
        const { width: decodedWidth, height: decodedHeight } =
          await loadImageData(filePath);
        expect({ width: decodedWidth, height: decodedHeight }).toStrictEqual({
          width: imageData.width,
          height: imageData.height,
        });
      }
    )
  );
});

test('encodeImageData', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryImageData({ width: 5, height: 5 }),
      fc.constantFrom<'image/png' | 'image/jpeg'>('image/png', 'image/jpeg'),
      async (imageData, mimeType) => {
        const buffer =
          mimeType === 'image/png'
            ? await encodeImageData(imageData, mimeType)
            : await encodeImageData(imageData, mimeType);
        const filePath = fileSync({
          template: `tmp-XXXXXX.${mimeType === 'image/png' ? 'png' : 'jpeg'}`,
        }).name;
        await writeFile(filePath, buffer);
        const { width: decodedWidth, height: decodedHeight } =
          await loadImageData(filePath);
        expect({ width: decodedWidth, height: decodedHeight }).toStrictEqual({
          width: imageData.width,
          height: imageData.height,
        });
      }
    )
  );
});

/**
 * Measure `fn` repeatedly until `timeLimitSeconds` has elapsed.
 */
async function measureRepeatedly(
  fn: () => MaybePromise<unknown>,
  { timeLimitSeconds }: { timeLimitSeconds: number }
): Promise<{
  count: number;
  elapsed: bigint;
  elapsedSeconds: number;
  rate: number;
}> {
  const NANOS_PER_SECOND = BigInt(1e9);
  const start = process.hrtime.bigint();
  const timeLimitNanos = BigInt(
    // eslint-disable-next-line vx/gts-safe-number-parse
    Math.floor(Number(NANOS_PER_SECOND) * timeLimitSeconds)
  );

  for (let count = 0; ; count += 1) {
    await fn();
    const elapsed = process.hrtime.bigint() - start;

    if (elapsed >= timeLimitNanos) {
      // eslint-disable-next-line vx/gts-safe-number-parse
      const elapsedSeconds = Number(elapsed) / Number(NANOS_PER_SECOND);
      const rate = count / elapsedSeconds;
      return { count, elapsed, elapsedSeconds, rate };
    }
  }
}

// TODO: Replace this with a service specifically geared toward measuring performance.
//
// This is too inconsistent to be a reliable performance benchmark. It's unclear whether
// it's the test environment, the test itself, or the code being tested that's causing
// the inconsistency.
//
// Consider replacing with a service like https://codspeed.io/.
test.skip('encodeImageData performance', async () => {
  const imageData = createImageData(1000, 1000);
  randomFillSync(imageData.data);

  const serial1x = await measureRepeatedly(
    () => encodeImageData(imageData, 'image/png'),
    { timeLimitSeconds: 0.5 }
  );

  const parallel2x = await measureRepeatedly(
    () =>
      // we want to ensure that these are running in parallel
      Promise.all([
        encodeImageData(imageData, 'image/png'),
        encodeImageData(imageData, 'image/png'),
      ]),
    { timeLimitSeconds: 0.5 }
  );

  const serial1xCount = serial1x.count;
  const parallel2xCount = parallel2x.count * 2;

  // Ideally we'd get a 2x speedup, but we'll settle for 1.5x given the overhead
  // of running in parallel and the uncertainty of the test environment. This
  // should at least ensure that running in parallel is faster in practice than
  // the serial one.
  expect(parallel2xCount / serial1xCount).toBeGreaterThan(1.5);
});
