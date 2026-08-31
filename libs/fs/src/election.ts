import { Result, err } from '@votingworks/basics';
import {
  ElectionDefinition,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { ZodError } from 'zod/v4';
import { ReadFileError, readFile } from './read_file';

/**
 * The largest election definition we will read. Generous relative to any real
 * election, whose size is dominated by its translated strings, but bounded so
 * that a file claiming to be an election cannot be read without limit.
 */
export const MAX_ELECTION_DEFINITION_SIZE = 100 * 1024 * 1024; // 100 MB

/**
 * Possible errors that can occur when reading an election.
 */
export type ReadElectionError =
  | { type: 'ReadFileError'; error: ReadFileError }
  | { type: 'ParseError'; error: ZodError | SyntaxError };

/**
 * Reads an election from a file path.
 */
export async function readElection(
  electionPath: string
): Promise<Result<ElectionDefinition, ReadElectionError>> {
  const readFileResult = await readFile(electionPath, {
    maxSize: MAX_ELECTION_DEFINITION_SIZE,
    encoding: 'utf-8',
  });

  if (readFileResult.isErr()) {
    return err({ type: 'ReadFileError', error: readFileResult.err() });
  }

  const parseResult = safeParseElectionDefinition(readFileResult.ok());

  if (parseResult.isErr()) {
    return err({ type: 'ParseError', error: parseResult.err() });
  }

  return parseResult;
}
