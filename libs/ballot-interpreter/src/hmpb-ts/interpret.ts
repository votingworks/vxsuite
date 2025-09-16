import { assert, err, ok } from '@votingworks/basics';
import { ImageData } from 'canvas';
import { ElectionDefinition, safeParseJson, SheetOf } from '@votingworks/types';
import { interpret as interpretImpl } from './addon';
import {
  InterpretedBallotCard,
  InterpretError,
  HmpbInterpretResult,
} from './types';

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

function normalizeOptionsForBridge(options: {
  electionDefinition: ElectionDefinition;
  ballotImages: SheetOf<string> | SheetOf<ImageData>;
  scoreWriteIns?: boolean;
  disableVerticalStreakDetection?: boolean;
  timingMarkAlgorithm?: 'contours' | 'corners';
  inferTimingMarks?: boolean;
  minimumDetectedScale?: number;
  debug?: boolean;
  frontNormalizedImageOutputPath?: string;
  backNormalizedImageOutputPath?: string;
}): Parameters<typeof interpretImpl> {
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

  return [
    options.electionDefinition.election,
    ...options.ballotImages,
    {
      debugBasePathSideA,
      debugBasePathSideB,
      scoreWriteIns: options.scoreWriteIns,
      timingMarkAlgorithm: options.timingMarkAlgorithm,
      disableVerticalStreakDetection: options.disableVerticalStreakDetection,
      inferTimingMarks: options.inferTimingMarks,
      minimumDetectedScale: options.minimumDetectedScale,
      frontNormalizedImageOutputPath: options.frontNormalizedImageOutputPath,
      backNormalizedImageOutputPath: options.backNormalizedImageOutputPath,
    },
  ];
}

/**
 * Interprets a scanned ballot.
 */
export function interpret(options: {
  electionDefinition: ElectionDefinition;
  ballotImages: SheetOf<string> | SheetOf<ImageData>;
  scoreWriteIns?: boolean;
  disableVerticalStreakDetection?: boolean;
  timingMarkAlgorithm?: 'contours' | 'corners';
  inferTimingMarks?: boolean;
  minimumDetectedScale?: number;
  debug?: boolean;
  frontNormalizedImageOutputPath?: string;
  backNormalizedImageOutputPath?: string;
}): HmpbInterpretResult {
  const args = normalizeOptionsForBridge(options);
  const result = interpretImpl(...args);
  const value = safeParseJson(result.value).unsafeUnwrap();

  if (!result.success) {
    return err(value as InterpretError);
  }

  return ok(value as InterpretedBallotCard);
}
