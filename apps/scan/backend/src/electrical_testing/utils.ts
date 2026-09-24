import { extractErrorMessage, type Result } from '@votingworks/basics';

export function resultToString(result: Result<unknown, unknown>): string {
  return result.isOk()
    ? 'Success'
    : `Error: ${extractErrorMessage(result.err())}`;
}
