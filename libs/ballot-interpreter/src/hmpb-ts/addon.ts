import { Election } from '@votingworks/types';
import { ImageData } from 'canvas';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { TimingMarks } from './types';

const addon = (() => {
  // NOTE: this only works because the build output can get to the root of the
  // project in the same number of `../` as the source input:
  //
  //   src/hmpb-ts/addon.ts -> build/addon.node via `../../build/addon.node`
  //   build/hmpb-ts/addon.js -> build/addon.node via `../../build/addon.node`
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
      success: false;
      value: string;
    }
  | {
      success: true;
      value: string;
      frontNormalizedImage: ImageData;
      backNormalizedImage: ImageData;
    };

/**
 * Type of the Rust `interpret` implementation. Under normal circumstances,
 * `success` will be true and `value` will be an `InterpretedBallotCard` as
 * JSON. If `success` is false, `value` will be an error object as JSON.
 */
export function interpret(
  election: Election,
  ballotImageSourceSideA: string | ImageData,
  ballotImageSourceSideB: string | ImageData,
  debugBasePathSideA?: string,
  debugBasePathSideB?: string,
  options?: {
    scoreWriteIns?: boolean;
    disableVerticalStreakDetection?: boolean;
    timingMarkAlgorithm?: 'contours' | 'corners';
    inferTimingMarks?: boolean;
    minimumDetectedScale?: number;
  }
): BridgeInterpretResult {
  return addon.interpret(
    election,
    ballotImageSourceSideA,
    ballotImageSourceSideB,
    debugBasePathSideA,
    debugBasePathSideB,
    options
  );
}

export function runBlankPaperDiagnostic(
  image: string | ImageData,
  debugBasePath?: string
): boolean {
  return addon.runBlankPaperDiagnostic(image, debugBasePath);
}

export function findTimingMarkGrid(
  image: string | ImageData,
  debugBasePath?: string,
  options?: {
    timingMarkAlgorithm?: 'contours' | 'corners';
  }
): TimingMarks {
  return addon.findTimingMarkGrid(image, debugBasePath, options);
}
