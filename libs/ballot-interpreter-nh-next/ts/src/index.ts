import { assert, err, ok } from '@votingworks/basics';
import { ElectionDefinition, safeParseJson, SheetOf } from '@votingworks/types';
// eslint-disable-next-line import/no-unresolved -- `./addon` is a native module
import { interpret as interpretImpl } from './addon';
import {
  InterpretedBallotCard,
  InterpretError,
  InterpretResult,
} from './types';

export * from './types';

/**
 * Interprets a scanned ballot.
 */
export function interpret(
  electionDefinition: ElectionDefinition,
  ballotImagePaths: SheetOf<string>
): InterpretResult {
  assert(typeof electionDefinition.electionData === 'string');
  assert(ballotImagePaths.length === 2);
  const [pathA, pathB] = ballotImagePaths;
  assert(typeof pathA === 'string');
  assert(typeof pathB === 'string');

  const result = interpretImpl(electionDefinition.electionData, pathA, pathB);
  const value = result.json
    ? safeParseJson(result.value as string).assertOk('extension set json=true')
    : result.value;

  return result.success
    ? ok(value as InterpretedBallotCard)
    : err(value as InterpretError);
}
