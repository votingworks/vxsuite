import { Election } from '@votingworks/types';
import { ImageData } from 'canvas';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { InterpretedBallotCard, InterpretError, TimingMarks } from './types';

const addon = (() => {
  // NOTE: this only works because the build output can get to the root of the
  // project in the same number of `../` as the source input:
  //
  //   src/bubble-ballot-ts/addon.ts -> build/addon.node via `../../build/addon.node`
  //   build/bubble-ballot-ts/addon.js -> build/addon.node via `../../build/addon.node`
  //
  const require = createRequire(__filename);
  const root = join(__dirname, '../..');
  // eslint-disable-next-line import/no-dynamic-require
  return require(join(root, 'build', 'addon.node'));
})();

/**
 * The result of calling `interpret`.
 */
export type BridgeInterpretResult =
  | {
    type: 'ok';
    value: InterpretedBallotCard;
  }
  | {
    type: 'err';
    value: InterpretError;
  };

/**
 * Options for the Rust interpreter bridge, matching the Rust JsInterpretOptions struct.
 * All fields used by the Rust interpreter must be present here.
 */
export interface JsInterpretOptions {
  frontNormalizedImageOutputPath?: string;
  backNormalizedImageOutputPath?: string;
  debugBasePathSideA?: string;
  debugBasePathSideB?: string;
  timingMarkAlgorithm?: 'contours' | 'corners';
  minimumDetectedScale?: number;
  scoreWriteIns?: boolean;
  disableVerticalStreakDetection?: boolean;
  inferTimingMarks?: boolean;
  maxCumulativeStreakWidth: number;
  retryStreakWidthThreshold: number;
}

/**
 * Type of the Rust `interpret` implementation. Under normal circumstances,
 * `success` will be true and `value` will be an `InterpretedBallotCard` as
 * JSON. If `success` is false, `value` will be an error object as JSON.
 */
export function interpret(
  election: Election,
  ballotImageSourceSideA: string | ImageData,
  ballotImageSourceSideB: string | ImageData,
  options: JsInterpretOptions
): BridgeInterpretResult {
  if (
    typeof ballotImageSourceSideA === 'string' &&
    typeof ballotImageSourceSideB === 'string'
  ) {
    return addon.interpretPaths(
      election,
      ballotImageSourceSideA,
      ballotImageSourceSideB,
      options
    );
  }

  const imageSideA = ballotImageSourceSideA as ImageData;
  const imageSideB = ballotImageSourceSideB as ImageData;
  return addon.interpretImages(
    election,
    imageSideA.width,
    imageSideA.height,
    imageSideA.data,
    imageSideB.width,
    imageSideB.height,
    imageSideB.data,
    options
  );
}

export function runBlankPaperDiagnosticFromPath(
  image: string | ImageData,
  debugBasePath?: string
): boolean {
  return addon.runBlankPaperDiagnosticFromPath(image, debugBasePath ?? null);
}

export function findTimingMarkGrid(
  image: string | ImageData,
  debugBasePath?: string,
  options?: {
    timingMarkAlgorithm?: 'contours' | 'corners';
  }
): TimingMarks {
  return typeof image === 'string'
    ? addon.findTimingMarkGridFromPath(
      image,
      debugBasePath ?? null,
      options ?? null
    )
    : addon.findTimingMarkGridFromImage(
      image.width,
      image.height,
      image.data,
      debugBasePath ?? null,
      options ?? null
    );
}
