import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { ImageData, createImageData } from 'canvas';
import fc from 'fast-check';
import { writeFile } from 'node:fs/promises';
import { makeTemporaryFile } from '@votingworks/fixtures';
import { randomFillSync } from 'node:crypto';
import { err, ok, MaybePromise } from '@votingworks/basics';
import { arbitraryImageData } from '../test/arbitraries';
import {
  RGBA_CHANNEL_COUNT,
  encodeImageData,
  ensureImageData,
  fromGrayScale,
  getImageChannelCount,
  isRgba,
  loadImageData,
  loadImageMetadata,
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
        const filePath = makeTemporaryFile({ postfix: `.${format}` });
        await writeImageData(filePath, imageData);
        const loadedImageData = (await loadImageData(filePath)).unsafeUnwrap();
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
        const filePath = makeTemporaryFile({ postfix: `.${format}` });
        await writeImageData(filePath, imageData);
        const loadedImageData = (await loadImageData(filePath)).unsafeUnwrap();
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

test('loadImageData on a corrupted image', async () => {
  const emptyFilePath = makeTemporaryFile({ postfix: '.png' });
  const imageData = await loadImageData(emptyFilePath);
  expect(imageData).toEqual(
    err({ type: 'invalid-image-file', message: expect.any(String) })
  );
});

test('toDataUrl image/png', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryImageData({ width: 5, height: 5 }),
      async (imageData) => {
        const dataUrl = toDataUrl(imageData, 'image/png');
        expect(dataUrl).toMatch(/^data:image\/png;base64,/);
        const { width: decodedWidth, height: decodedHeight } = (
          await loadImageData(dataUrl)
        ).unsafeUnwrap();
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
        const { width: decodedWidth, height: decodedHeight } = (
          await loadImageData(dataUrl)
        ).unsafeUnwrap();
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
        const filePath = makeTemporaryFile({ postfix: `.${format}` });
        await writeFile(filePath, buffer);
        const { width: decodedWidth, height: decodedHeight } = (
          await loadImageData(filePath)
        ).unsafeUnwrap();
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
        const filePath = makeTemporaryFile({
          postfix: `.${mimeType === 'image/png' ? 'png' : 'jpeg'}`,
        });
        await writeFile(filePath, buffer);
        const { width: decodedWidth, height: decodedHeight } = (
          await loadImageData(filePath)
        ).unsafeUnwrap();
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

test('loadImageMetadata from buffer', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryImageData(),
      fc.constantFrom<'image/png' | 'image/jpeg'>('image/png', 'image/jpeg'),
      async (imageData, mimeType) => {
        const buffer = toImageBuffer(imageData, mimeType);
        const result = await loadImageMetadata(buffer);
        expect(result).toEqual(
          ok({
            type: mimeType,
            width: imageData.width,
            height: imageData.height,
          })
        );
      }
    )
  );
});

test('loadImageMetadata from file', async () => {
  await fc.assert(
    fc.asyncProperty(
      arbitraryImageData(),
      fc.constantFrom<'image/png' | 'image/jpeg'>('image/png', 'image/jpeg'),
      async (imageData, mimeType) => {
        const ext = mimeType === 'image/png' ? 'png' : 'jpeg';
        const filePath = makeTemporaryFile({ postfix: `.${ext}` });
        await writeImageData(filePath, imageData);
        const result = await loadImageMetadata(filePath);
        expect(result).toEqual(
          ok({
            type: mimeType,
            width: imageData.width,
            height: imageData.height,
          })
        );
      }
    )
  );
});

test('loadImageMetadata on a non-existent file', async () => {
  const result = await loadImageMetadata('/path/does/not/exist.png');
  expect(result).toEqual(
    err({ type: 'invalid-image-file', message: expect.any(String) })
  );
});

test('loadImageMetadata on corrupted data', async () => {
  const result = await loadImageMetadata(Buffer.from('not an image'));
  expect(result).toEqual(
    err({ type: 'invalid-image-file', message: expect.any(String) })
  );
});

test('loadImageMetadata on PNG with non-IHDR chunk', async () => {
  const pngImageBuffer = toImageBuffer(createImageData(1, 1), 'image/png');
  expect(pngImageBuffer.toString('ascii', 12, 16)).toEqual('IHDR');
  // corrupt IHDR chunk
  pngImageBuffer[12] = 0x00;

  expect(await loadImageMetadata(pngImageBuffer)).toEqual(
    err({ type: 'invalid-image-file', message: expect.any(String) })
  );
});

test('loadImageMetadata on JPEG with no SOF marker found', async () => {
  // SOI (FF D8) + EOI (FF D9, payload-less marker) with no SOF — the scan
  // loop hits the payload-less `continue` branch then exhausts the buffer
  const result = await loadImageMetadata(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  expect(result).toEqual(
    err({ type: 'invalid-image-file', message: expect.any(String) })
  );
});

test('loadImageMetadata on JPEG with invalid marker byte mid-stream', async () => {
  // SOI + RST0 (payload-less, advances offset) + non-FF byte where the next
  // marker prefix should be
  const result = await loadImageMetadata(
    Buffer.from([0xff, 0xd8, 0xff, 0xd0, 0xab, 0xcd])
  );
  expect(result).toEqual(
    err({ type: 'invalid-image-file', message: expect.any(String) })
  );
});

test('loadImageMetadata on JPEG truncated before segment length', async () => {
  // SOI + APP0 marker (FF E0) with no room for the 2-byte length field
  const result = await loadImageMetadata(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  expect(result).toEqual(
    err({ type: 'invalid-image-file', message: expect.any(String) })
  );
});

test('loadImageMetadata on JPEG with invalid segment length', async () => {
  // SOI + APP0 marker (FF E0) + 2-byte length field of 1, which is less than
  // the minimum valid value of 2 (the length field includes itself)
  const result = await loadImageMetadata(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01]));
  expect(result).toEqual(
    err({ type: 'invalid-image-file', message: expect.any(String) })
  );
});

test('loadImageMetadata on JPEG truncated inside SOF payload', async () => {
  // SOI + SOF0 marker (FF C0) + 2-byte length field but not enough bytes for
  // the SOF payload (precision + height + width = 5 more bytes needed)
  const result = await loadImageMetadata(
    Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x08, 0x08])
  );
  expect(result).toEqual(
    err({ type: 'invalid-image-file', message: expect.any(String) })
  );
});

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
