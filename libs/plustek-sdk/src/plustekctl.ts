import { ok, Result } from '@votingworks/types';

/**
 * Locates the `plustekctl` binary.
 */
export async function findBinaryPath(): Promise<Result<string, Error>> {
  // TODO: either remove this function or actually validate `plustekctl` exists.
  return ok('plustekctl');
}
