import { ok, Result } from "@votingworks/types";

export async function findBinaryPath(): Promise<Result<string, Error>> {
  return ok('plustekctl')
}
