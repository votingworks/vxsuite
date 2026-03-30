import { assert, err, ok } from '@votingworks/basics';
import { ImageData } from 'canvas';
import {
  ElectionDefinition,
  SheetOf,
  DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
  DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
} from '@votingworks/types';
import type { BridgeInterpretOptions } from '../../index';
import { napi } from './napi';
import { BridgeInterpretResult, HmpbInterpretResult } from './types';

/**
 * Options for interpreting a ballot at the bridge layer.
 * Some fields are computed from higher-level options.
 */
export interface InterpretOptions {
  electionDefinition: ElectionDefinition;
  ballotImages: SheetOf<string> | SheetOf<ImageData>;
  scoreWriteIns?: boolean;
  disableVerticalStreakDetection?: boolean;
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

function buildBridgeOptions(options: InterpretOptions): BridgeInterpretOptions {
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

  return {
    debugBasePathSideA,
    debugBasePathSideB,
    scoreWriteIns: options.scoreWriteIns,
    disableVerticalStreakDetection: options.disableVerticalStreakDetection,
    minimumDetectedScale: options.minimumDetectedScale,
    maxCumulativeStreakWidth:
      options.maxCumulativeStreakWidth ?? DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
    retryStreakWidthThreshold:
      options.retryStreakWidthThreshold ?? DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
    frontNormalizedImageOutputPath: options.frontNormalizedImageOutputPath,
    backNormalizedImageOutputPath: options.backNormalizedImageOutputPath,
  };
}

/**
 * Interprets a scanned ballot.
 */
export async function interpret(
  options: InterpretOptions
): Promise<HmpbInterpretResult> {
  const bridgeOptions = buildBridgeOptions(options);
  const [sideA, sideB] = options.ballotImages;
  const { election } = options.electionDefinition;
  let result: BridgeInterpretResult;

  if (typeof sideA === 'string' && typeof sideB === 'string') {
    result = await napi.interpretPaths(election, sideA, sideB, bridgeOptions);
  } else {
    const imageSideA = sideA as ImageData;
    const imageSideB = sideB as ImageData;
    result = await napi.interpretImages(
      election,
      imageSideA.width,
      imageSideA.height,
      imageSideA.data,
      imageSideB.width,
      imageSideB.height,
      imageSideB.data,
      bridgeOptions
    );
  }

  if (result.type === 'err') {
    return err(result.value);
  }

  return ok(result.value);
}
