import {
  getImageChannelCount,
  loadImageData,
  rotate180,
  writeImageData,
} from '@votingworks/image-utils';
import {
  BallotTargetMarkPosition,
  BallotTargetMarkPositionSchema,
  err,
  ok,
  Point,
  Rect,
  Result,
  safeParse,
  TargetShape,
} from '@votingworks/types';
import { assert } from '@votingworks/utils';
import { createImageData } from 'canvas';
import chalk from 'chalk';
import { basename } from 'path';
import { ContestShape, findContests } from '../../hmpb/find_contests';
import { findTargets } from '../../hmpb/find_targets';
import { binarize, RGBA } from '../../utils/binarize';
import { rectCenter } from '../../utils/geometry';
import { adjacentFile } from '../../utils/path';
import { Command, GlobalOptions } from '../types';

export interface HelpOptions {
  help: true;
}

export interface LayoutOptions {
  help: false;
  ballotImagePaths: readonly string[];
  targetMarkPosition?: BallotTargetMarkPosition;
}

export type Options = HelpOptions | LayoutOptions;

const RGBA_CHANNELS = 4;
const RED_OVERLAY_COLOR: RGBA = [0xff, 0, 0, 0x60];
const GREEN_OVERLAY_COLOR: RGBA = [0, 0xff, 0, 0x60];
const BLUE_OVERLAY_COLOR: RGBA = [0, 0, 0xff, 0x60];

export const name = 'layout';
export const description = 'Annotate the interpreted layout of a ballot page';

export function printHelp(
  globalOptions: GlobalOptions,
  out: NodeJS.WritableStream
): void {
  const $0 = basename(globalOptions.executablePath);
  out.write(`${$0} layout IMG1 [IMG2 …]\n`);
  out.write(`\n`);
  out.write(chalk.italic(`Examples\n`));
  out.write(`\n`);
  out.write(chalk.gray(`# Annotate layout for a single ballot page.\n`));
  out.write(`${$0} layout ballot01.jpg\n`);
  out.write(`\n`);
  out.write(chalk.gray(`# Annotate layout for many ballot pages.\n`));
  out.write(`${$0} layout ballot*.jpg\n`);
}

export function parseOptions({
  commandArgs: args,
}: GlobalOptions): Result<Options, Error> {
  let help = false;
  let targetMarkPosition: BallotTargetMarkPosition | undefined;
  const ballotImagePaths: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--target-mark-position' || arg === '-t') {
      const argValue = args[i + 1];
      i += 1;
      const targetMarkPositionResult = safeParse(
        BallotTargetMarkPositionSchema,
        argValue
      );
      if (targetMarkPositionResult.isErr()) {
        return err(new Error(`invalid target mark position: ${argValue}`));
      }
      targetMarkPosition = targetMarkPositionResult.ok();
    } else if (arg.startsWith('-')) {
      return err(new Error(`unexpected option passed to 'layout': ${arg}`));
    } else {
      ballotImagePaths.push(arg);
    }
  }

  return ok({ help, ballotImagePaths, targetMarkPosition });
}

interface AnalyzeImageResult {
  contests: ContestShape[];
  targets: TargetShape[];
  rotated: boolean;
}

function analyzeImage(
  imageData: ImageData,
  {
    targetMarkPosition = BallotTargetMarkPosition.Left,
  }: { targetMarkPosition?: BallotTargetMarkPosition } = {}
): AnalyzeImageResult {
  const binarized = createImageData(imageData.width, imageData.height);
  binarize(imageData, binarized);

  const transforms = [
    (toTransform: ImageData): { imageData: ImageData; rotated: boolean } => ({
      imageData: toTransform,
      rotated: false,
    }),
    (toTransform: ImageData): { imageData: ImageData; rotated: boolean } => {
      const rotatedImageData = createImageData(
        Uint8ClampedArray.from(toTransform.data),
        toTransform.width,
        toTransform.height
      );
      rotate180(rotatedImageData);
      return { imageData: rotatedImageData, rotated: true };
    },
  ];

  const columnPatterns = [
    [true, true, true],
    [true, true],
  ];

  for (const transform of transforms) {
    const transformed = transform(binarized);

    for (const columns of columnPatterns) {
      const contests = [...findContests(transformed.imageData, { columns })];
      const targets = contests.flatMap((contest) =>
        Array.from(
          findTargets(transformed.imageData, contest.bounds, {
            targetMarkPosition,
          })
        )
      );
      if (contests.length > 0) {
        return { contests, targets, rotated: transformed.rotated };
      }
    }
  }

  return { contests: [], targets: [], rotated: false };
}

/**
 * Computes the color of a pixel by blending `src` on top of `dst`.
 *
 * @see https://en.wikipedia.org/wiki/Alpha_compositing#Alpha_blending
 */
function alphaBlend(dst: ArrayLike<number>, src: ArrayLike<number>): RGBA {
  const dstR = dst[0];
  const dstG = dst[1];
  const dstB = dst[2];
  const dstA = dst[3];
  const srcR = src[0];
  const srcG = src[1];
  const srcB = src[2];
  const srcA = src[3];
  return [
    (srcR * srcA) / 0xff + ((dstR * dstA) / 0xff) * (1 - srcA / 0xff),
    (srcG * srcA) / 0xff + ((dstG * dstA) / 0xff) * (1 - srcA / 0xff),
    (srcB * srcA) / 0xff + ((dstB * dstA) / 0xff) * (1 - srcA / 0xff),
    (srcA / 0xff + (1 - srcA / 0xff)) * 0xff,
  ];
}

/**
 * Draws a target composed of concentric squares around a given point. If the
 * color has transparency, the fill blends with the existing image.
 */
function drawTarget(
  { data, width, height }: ImageData,
  { x, y }: Point,
  color: RGBA,
  size: number
): void {
  assert(getImageChannelCount({ data, width, height }) === RGBA_CHANNELS);

  const halfSize = Math.ceil(size / 2);

  for (let xd = -halfSize; xd <= halfSize; xd += 1) {
    for (let yd = -halfSize; yd <= halfSize; yd += 1) {
      if (
        (xd % 2 !== 0 && Math.abs(yd) <= Math.abs(xd)) ||
        (yd % 2 !== 0 && Math.abs(xd) <= Math.abs(yd))
      ) {
        const offset = ((y + yd) * width + (x + xd)) * RGBA_CHANNELS;
        const dst = data.slice(offset, offset + RGBA_CHANNELS);
        data.set(alphaBlend(dst, color), offset);
      }
    }
  }
}

/**
 * Fills a region of an image with a particular color. If the color has
 * transparency, the fill blends with the existing image.
 */
function fill(
  { data, width, height }: ImageData,
  bounds: Rect,
  color: RGBA
): void {
  assert(getImageChannelCount({ data, width, height }) === RGBA_CHANNELS);

  for (let { y } = bounds; y < bounds.y + bounds.height; y += 1) {
    for (let { x } = bounds; x < bounds.x + bounds.width; x += 1) {
      const offset = (y * width + x) * RGBA_CHANNELS;
      const dst = data.slice(offset, offset + RGBA_CHANNELS);
      data.set(alphaBlend(dst, color), offset);
    }
  }
}

/**
 * Finds features in an image and writes an image adjacent with overlays marking
 * those features.
 */
export async function run(
  _commands: readonly Command[],
  globalOptions: GlobalOptions,
  _stdin: NodeJS.ReadableStream,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream
): Promise<number> {
  const optionsResult = parseOptions(globalOptions);

  if (optionsResult.isErr()) {
    stderr.write(`${optionsResult.err().message}\n`);
    return 1;
  }

  const options = optionsResult.ok();

  if (options.help) {
    printHelp(globalOptions, stdout);
    return 0;
  }

  if (options.ballotImagePaths.length === 0) {
    printHelp(globalOptions, stdout);
    return 1;
  }

  for (const ballotImagePath of options.ballotImagePaths) {
    const imageData = await loadImageData(ballotImagePath);
    const { contests, targets, rotated } = analyzeImage(imageData, {
      targetMarkPosition: options.targetMarkPosition,
    });
    const targetWidth = Math.max(15, Math.round(imageData.width * 0.01));

    if (rotated) {
      rotate180(imageData);
    }

    for (const contest of contests) {
      fill(imageData, contest.bounds, GREEN_OVERLAY_COLOR);

      for (const corner of contest.corners) {
        drawTarget(imageData, corner, RED_OVERLAY_COLOR, targetWidth);
      }
    }

    for (const target of targets) {
      drawTarget(
        imageData,
        rectCenter(target.bounds, { round: true }),
        BLUE_OVERLAY_COLOR,
        targetWidth
      );
    }

    const layoutFilePath = adjacentFile('-layout', ballotImagePath);
    stdout.write(
      `📝 ${layoutFilePath} ${chalk.gray(
        `(${contests.length} contest(s), ${targets.length} target(s))`
      )}\n`
    );
    await writeImageData(layoutFilePath, imageData);
  }

  return 0;
}
