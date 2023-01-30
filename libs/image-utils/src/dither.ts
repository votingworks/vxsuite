import { ok, Result } from '@votingworks/basics';
import { safeParseInt } from '@votingworks/types';
import { createImageData } from 'canvas';
import {
  getImageChannelCount,
  ImageProcessingError,
  isGrayscale,
  loadImageData,
  toGrayscale,
  writeImageData,
} from './image_data';
import { otsu } from './otsu';

/**
 * A dithered image and the threshold used to dither it.
 */
export interface DitheredImage {
  readonly imageData: ImageData;
  readonly threshold: number;
}

/**
 * The result of dithering an image.
 */
export type DitherResult = Result<DitheredImage, ImageProcessingError>;

/**
 * Dithers an ImageData using the Floyd-Steinberg algorithm. Expects a grayscale
 * image and returns a monochrome image.
 */
export function dither(
  input: ImageData,
  {
    threshold = otsu(input.data, getImageChannelCount(input)),
  }: { threshold?: number } = {}
): DitherResult {
  if (!isGrayscale(input)) {
    const toGrayscaleResult = toGrayscale(input);
    if (toGrayscaleResult.isErr()) {
      return toGrayscaleResult;
    }
    return dither(toGrayscaleResult.ok(), { threshold });
  }

  const channelCount = 1;
  const { data, width, height } = input;
  const src = Float32Array.from(data);
  const dst = new Uint8ClampedArray(width * height * channelCount);
  const output = createImageData(dst, width, height);

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

  return ok({ imageData: output, threshold });
}

/* istanbul ignore next */
/* eslint-disable */
if (require.main === module) {
  /**
   * Runs the dithering algorithm on an image and writes the result to a file.
   *
   * Usage: npx --package=esbuild-runner -- esr --cache dither.ts input.png output.png [threshold]
   */
  async function main(args: readonly string[]): Promise<number> {
    const inputPath = args[2];
    const outputPath = args[3];
    const threshold = safeParseInt(args[4], { min: 0, max: 255 }).ok();

    if (!inputPath || !outputPath) {
      console.error('Usage: dither.ts input.png output.png [threshold]');
      return 1;
    }

    const imageData = await loadImageData(inputPath);
    const ditheredImage = dither(imageData, { threshold }).assertOk(
      'dither failed'
    );
    console.log('Dithered image with threshold:', ditheredImage.threshold);
    await writeImageData(outputPath, ditheredImage.imageData);

    return 0;
  }

  main(process.argv);
}
