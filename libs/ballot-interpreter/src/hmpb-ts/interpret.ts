import { assert, err, ok } from '@votingworks/basics';
import { ElectionDefinition, safeParseJson, SheetOf } from '@votingworks/types';
import { interpret as interpretImpl } from './rust_addon';
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

    /* istanbul ignore next */
    default:
      assert(false, `unknown imageSource type: ${typeof imageSource}`);
  }
}

function normalizeArgumentsForBridge(
  electionDefinition: ElectionDefinition,
  ballotImageSources: SheetOf<string> | SheetOf<ImageData>,
  options:
    | { scoreWriteIns?: boolean; debug?: boolean }
    | { scoreWriteIns?: boolean; debugBasePaths?: SheetOf<string> }
): Parameters<typeof interpretImpl> {
  assert(typeof electionDefinition.electionData === 'string');
  assert(ballotImageSources.length === 2);
  checkImageSource(ballotImageSources[0]);
  checkImageSource(ballotImageSources[1]);

  let debugBasePathSideA: string | undefined;
  let debugBasePathSideB: string | undefined;

  if ('debugBasePaths' in options) {
    [debugBasePathSideA, debugBasePathSideB] = options.debugBasePaths ?? [];
  } else if (
    'debug' in options &&
    options.debug &&
    typeof ballotImageSources[0] === 'string' &&
    typeof ballotImageSources[1] === 'string'
  ) {
    [debugBasePathSideA, debugBasePathSideB] =
      ballotImageSources as SheetOf<string>;
  }

  return [
    electionDefinition.election,
    ...ballotImageSources,
    debugBasePathSideA,
    debugBasePathSideB,
    { scoreWriteIns: options.scoreWriteIns ?? false },
  ];
}

/**
 * Interprets a scanned ballot.
 */
export function interpret(
  electionDefinition: ElectionDefinition,
  ballotImagePaths: SheetOf<string>,
  options?: { scoreWriteIns?: boolean; debug?: boolean }
): HmpbInterpretResult;
/**
 * Interprets a scanned ballot.
 */
export function interpret(
  electionDefinition: ElectionDefinition,
  ballotImages: SheetOf<ImageData>,
  options?: { scoreWriteIns?: boolean; debugBasePaths?: SheetOf<string> }
): HmpbInterpretResult;
/**
 * Interprets a scanned ballot.
 */
export function interpret(
  electionDefinition: ElectionDefinition,
  ballotImageSources: SheetOf<string> | SheetOf<ImageData>,
  options:
    | { scoreWriteIns?: boolean; debug?: boolean }
    | { scoreWriteIns?: boolean; debugBasePaths?: SheetOf<string> } = {}
): HmpbInterpretResult {
  const args = normalizeArgumentsForBridge(
    electionDefinition,
    ballotImageSources,
    options
  );
  const result = interpretImpl(...args);
  const parseJsonResult = safeParseJson(result.value);

  /* istanbul ignore next */
  if (parseJsonResult.isErr()) {
    return err({
      type: 'unknown',
      message: parseJsonResult.err().message,
    });
  }

  const value = parseJsonResult.ok();

  if (!result.success) {
    return err(value as InterpretError);
  }

  const interpretedBallotCard = value as InterpretedBallotCard;

  // The normalized images are not included in the JSON string for performance
  // reasons. Instead, they are transferred as `ImageData`-compatible objects
  // which transfers the pixel data as a fast memory copy. As a result, we need
  // to add them back in here.
  const { frontNormalizedImage, backNormalizedImage } = result;
  interpretedBallotCard.front.normalizedImage = frontNormalizedImage;
  interpretedBallotCard.back.normalizedImage = backNormalizedImage;

  return ok(interpretedBallotCard);
}
