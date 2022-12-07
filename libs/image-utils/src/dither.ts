import { ok, Result } from '@votingworks/types';
import { createImageData } from 'canvas';
import {
  ImageProcessingError,
  isGrayscale,
  loadImageData,
  toGrayscale,
  writeImageData,
} from './image_data';

/**
 * Dithers an ImageData using the Floyd-Steinberg algorithm. Expects a grayscale
 * image and returns a monochrome image.
 */
export function dither(
  input: ImageData
): Result<ImageData, ImageProcessingError> {
  if (!isGrayscale(input)) {
    const toGrayscaleResult = toGrayscale(input);
    if (toGrayscaleResult.isErr()) {
      return toGrayscaleResult;
    }
    return dither(toGrayscaleResult.ok());
  }

  const channelCount = 1;
  const { data, width, height } = input;
  const src = Float32Array.from(data);
  const dst = new Uint8ClampedArray(width * height * channelCount);
  const output = createImageData(dst, width, height);
  const threshold = 128;

  for (let y = 0, offset = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, offset += channelCount) {
      const oldPixel = src[offset] as number;
      const newPixel = oldPixel < threshold ? 0 : 255;
      const error = oldPixel - newPixel;

      dst[offset] = newPixel;

      const errorDiv16 = error / 16;

      if (x < width - 1) {
        src[offset + channelCount] += errorDiv16 * 7;
      }

      if (y < height - 1) {
        const nextRowOffset = offset + width * channelCount;

        if (x > 0) {
          src[nextRowOffset - channelCount] += errorDiv16 * 3;
        }

        src[nextRowOffset] += errorDiv16 * 5;
        src[nextRowOffset + channelCount] += errorDiv16;
      }
    }
  }

  return ok(output);
}

/* istanbul ignore next */
/* eslint-disable */
if (require.main === module) {
  async function main(args: readonly string[]): Promise<number> {
    const inputPath = args[2];
    const outputPath = args[3];

    if (!inputPath || !outputPath) {
      console.error('Usage: dither.ts input.png output.png');
      return 1;
    }

    const imageData = await loadImageData(inputPath);
    const ditheredImageData = dither(imageData).assertOk('dither failed');
    await writeImageData(outputPath, ditheredImageData);

    return 0;
  }

  main(process.argv);
}
