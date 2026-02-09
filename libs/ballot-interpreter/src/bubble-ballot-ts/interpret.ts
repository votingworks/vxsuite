import { assert, err, ok } from '@votingworks/basics';
import { ImageData } from 'canvas';
import {
  ElectionDefinition,
  SheetOf,
  DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
  DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
} from '@votingworks/types';
import { interpret as interpretImpl, JsInterpretOptions } from './addon';
import { HmpbInterpretResult } from './types';

/**
 * Options for interpreting a ballot at the bridge layer.
 * Some fields are computed from higher-level options.
 */
interface InterpretOptions {
  electionDefinition: ElectionDefinition;
  ballotImages: SheetOf<string> | SheetOf<ImageData>;
  scoreWriteIns?: boolean;
  disableVerticalStreakDetection?: boolean;
  timingMarkAlgorithm?: 'contours' | 'corners';
  inferTimingMarks?: boolean;
  minimumDetectedScale?: number;
  maxCumulativeStreakWidth?: number;
  retryStreakWidthThreshold?: number;
  debug?: boolean;
  frontNormalizedImageOutputPath?: string;
  backNormalizedImageOutputPath?: string;
}

function assertImageData(imageData: unknown): asserts imageData is ImageData {
  assert(
    typeof imageData === 'object' &&
      imageData !== null &&
      typeof (imageData as ImageData).width === 'number' &&
      typeof (imageData as ImageData).height === 'number' &&
      typeof (imageData as ImageData).data === 'object',
    'imageData is not an ImageData'
  );
}

function checkImageSource(imageSource: string | ImageData): void {
  switch (typeof imageSource) {
    case 'string':
      break;

    case 'object':
      assertImageData(imageSource);
      break;

    /* istanbul ignore next - @preserve */
    default:
      assert(false, `unknown imageSource type: ${typeof imageSource}`);
  }
}

function normalizeOptionsForBridge(
  options: InterpretOptions
): Parameters<typeof interpretImpl> {
  assert(typeof options.electionDefinition.electionData === 'string');
  assert(options.ballotImages.length === 2);
  checkImageSource(options.ballotImages[0]);
  checkImageSource(options.ballotImages[1]);

  let debugBasePathSideA: string | undefined;
  let debugBasePathSideB: string | undefined;

  if (
    options.debug &&
    typeof options.ballotImages[0] === 'string' &&
    typeof options.ballotImages[1] === 'string'
  ) {
    [debugBasePathSideA, debugBasePathSideB] =
      options.ballotImages as SheetOf<string>;
  }

  const jsOptions: JsInterpretOptions = {
    debugBasePathSideA,
    debugBasePathSideB,
    scoreWriteIns: options.scoreWriteIns,
    timingMarkAlgorithm: options.timingMarkAlgorithm,
    disableVerticalStreakDetection: options.disableVerticalStreakDetection,
    inferTimingMarks: options.inferTimingMarks,
    minimumDetectedScale: options.minimumDetectedScale,
    maxCumulativeStreakWidth:
      options.maxCumulativeStreakWidth ?? DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
    retryStreakWidthThreshold:
      options.retryStreakWidthThreshold ??
      DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
    frontNormalizedImageOutputPath: options.frontNormalizedImageOutputPath,
    backNormalizedImageOutputPath: options.backNormalizedImageOutputPath,
  };

  return [
    options.electionDefinition.election,
    ...options.ballotImages,
    jsOptions,
  ];
}

/**
 * Interprets a scanned ballot.
 */
export function interpret(options: InterpretOptions): HmpbInterpretResult {
  const args = normalizeOptionsForBridge(options);
  const result = interpretImpl(...args);

  if (result.type === 'err') {
    return err(result.value);
  }

  return ok(result.value);
}
