import { assert, err, ok } from '@votingworks/basics';
import {
  type BallotImageBitDepth,
  type EncodedImage,
  type ImageData,
  type SheetOf,
  DEFAULT_BALLOT_IMAGE_BIT_DEPTH,
  DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
  DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
} from '@votingworks/types';
import type { BridgeInterpretOptions } from '../../index.js';
import { napi } from './napi.js';
import type { BridgeInterpretResult, HmpbInterpretResult } from './types.js';

/**
 * Options for interpreting a ballot at the bridge layer.
 * Some fields are computed from higher-level options.
 */
export interface InterpretOptions {
  ballotImages: SheetOf<string> | SheetOf<ImageData> | SheetOf<EncodedImage>;
  scoreWriteIns?: boolean;
  disableVerticalStreakDetection?: boolean;
  minimumDetectedScale?: number;
  maxCumulativeStreakWidth?: number;
  retryStreakWidthThreshold?: number;
  ballotImageBitDepth?: BallotImageBitDepth;
  debug?: boolean;
  frontNormalizedImageOutputPath?: string;
  backNormalizedImageOutputPath?: string;
  dbPath: string;
}

function isEncodedImage(
  image: ImageData | EncodedImage
): image is EncodedImage {
  return 'encoded' in image;
}

function checkImageSource(
  imageSource: string | ImageData | EncodedImage
): void {
  switch (typeof imageSource) {
    case 'string':
      break;

    case 'object':
      assert(
        isEncodedImage(imageSource)
          ? imageSource.encoded instanceof Uint8Array
          : typeof imageSource.width === 'number' &&
              typeof imageSource.height === 'number' &&
              typeof imageSource.data === 'object',
        'imageSource is neither an ImageData nor an EncodedImage'
      );
      break;

    default:
      assert(false, `unknown imageSource type: ${typeof imageSource}`);
  }
}

function buildBridgeOptions(options: InterpretOptions): BridgeInterpretOptions {
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
    ballotImageBitDepth:
      options.ballotImageBitDepth ?? DEFAULT_BALLOT_IMAGE_BIT_DEPTH,
    frontNormalizedImageOutputPath: options.frontNormalizedImageOutputPath,
    backNormalizedImageOutputPath: options.backNormalizedImageOutputPath,
    dbPath: options.dbPath,
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
  let result: BridgeInterpretResult;

  if (typeof sideA === 'string' && typeof sideB === 'string') {
    result = await napi.interpretPaths(sideA, sideB, bridgeOptions);
  } else if (typeof sideA === 'object' && isEncodedImage(sideA)) {
    result = await napi.interpretEncoded(
      sideA.encoded,
      (sideB as EncodedImage).encoded,
      bridgeOptions
    );
  } else {
    const imageSideA = sideA as ImageData;
    const imageSideB = sideB as ImageData;
    result = await napi.interpretImages(
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
