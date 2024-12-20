import { ImageData } from 'canvas';
import pixelmatch from 'pixelmatch';
import { format } from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { writeImageData } from './image_data';

/**
 * Options for the `toMatchImage` custom Jest matcher.
 */
export interface ToMatchImageOptions {
  /**
   * Path to save the diff image to in case of a mismatch.
   */
  diffPath?: string;
  /**
   * The maximum percentage of pixels that can differ before the images are
   * considered unequal. The default is `0`. Should be a number between `0` and
   * `1`.
   */
  failureThreshold?: number;
}

/**
 * Copies the data from one ImageData to another at the specified coordinates.
 *
 * Named after the `PNG.bitblt` method in the `pngjs` library because that's
 * what the original version of `toMatchImage` used.
 *
 * @see https://en.wikipedia.org/wiki/Bit_blit
 */
function bitblt(src: ImageData, dst: ImageData, dx: number, dy: number): void {
  const channels = 4;
  const srcData = src.data;
  const dstData = dst.data;
  const bytesPerRowSrc = src.width * channels;
  const bytesPerRowDst = dst.width * channels;

  for (
    let y = 0, yOffsetSrc = 0, yOffsetDst = dy * dst.width * channels;
    y < src.height;
    y += 1, yOffsetSrc += bytesPerRowSrc, yOffsetDst += bytesPerRowDst
  ) {
    for (
      let x = 0, offsetSrc = yOffsetSrc, offsetDst = yOffsetDst + dx * channels;
      x < src.width;
      x += 1, offsetSrc += channels, offsetDst += channels
    ) {
      dstData[offsetDst] = srcData[offsetSrc] as number;
      dstData[offsetDst + 1] = srcData[offsetSrc + 1] as number;
      dstData[offsetDst + 2] = srcData[offsetSrc + 2] as number;
      dstData[offsetDst + 3] = srcData[offsetSrc + 3] as number;
    }
  }
}

/**
 * Custom `jest` matcher to compare two `ImageData` instances.
 */
export async function toMatchImage(
  received: ImageData,
  expected: ImageData,
  options: ToMatchImageOptions = {}
): Promise<jest.CustomMatcherResult> {
  assert(
    options.failureThreshold === undefined ||
      (options.failureThreshold >= 0 && options.failureThreshold <= 1)
  );
  const diffImg = new ImageData(received.width, received.height);
  const diff = pixelmatch(
    received.data,
    expected.data,
    diffImg.data,
    received.width,
    received.height
  );
  const totalPixels = received.width * received.height;
  const diffPercentage = diff / totalPixels;

  const pass = diffPercentage <= (options.failureThreshold ?? 0);

  if (pass) {
    return {
      message: () => 'Expected the images to differ, but they are equal.',
      pass: true,
    };
  }

  const errorMessage = `Expected the images to be equal, but they differ by ${diff} pixels (${format.percent(
    diffPercentage
  )}).`;

  if (!options.diffPath) {
    return {
      message: () => errorMessage,
      pass: false,
    };
  }

  const compositeImg = new ImageData(3 * received.width, received.height);

  bitblt(received, compositeImg, 0, 0);
  bitblt(diffImg, compositeImg, received.width, 0);
  bitblt(expected, compositeImg, 2 * received.width, 0);

  await writeImageData(options.diffPath, compositeImg);

  return {
    message: () => `${errorMessage} Diff image saved to ${options.diffPath}.`,
    pass,
  };
}
