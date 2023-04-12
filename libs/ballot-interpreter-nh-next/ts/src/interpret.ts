import { assert, err, ok } from '@votingworks/basics';
import { ElectionDefinition, safeParseJson, SheetOf } from '@votingworks/types';
// eslint-disable-next-line import/no-unresolved -- `./rust-addon` is a native module
import { interpret as interpretImpl } from './rust-addon';
import {
  InterpretedBallotCard,
  InterpretError,
  InterpretResult,
} from './types';

/**
 * Interprets a scanned ballot.
 */
export function interpret(
  electionDefinition: ElectionDefinition,
  ballotImagePaths: SheetOf<string>,
  { debug = false } = {}
): InterpretResult {
  assert(typeof electionDefinition.electionData === 'string');
  assert(ballotImagePaths.length === 2);
  const [pathA, pathB] = ballotImagePaths;
  assert(typeof pathA === 'string');
  assert(typeof pathB === 'string');
  assert(typeof debug === 'boolean');

  const result = interpretImpl(
    electionDefinition.electionData,
    pathA,
    pathB,
    debug
  );
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
