import { extractErrorMessage } from '@votingworks/basics';
import { isNodeEnvProduction } from '@votingworks/utils';

/**
 * Reports why NODE_ENV can't be used, or `undefined` if it can. The rule about
 * which values are acceptable belongs to `libs/utils`, so this asks it rather
 * than restating it, and adds what to do about a bad answer.
 */
export function checkNodeEnv(): string | undefined {
  try {
    isNodeEnvProduction();
    return undefined;
  } catch (error) {
    return (
      `${extractErrorMessage(error)}. Set NODE_ENV=production on a VxAdmin, ` +
      `or NODE_ENV=development to sign with development keys.`
    );
  }
}

/**
 * The same check, but only for a value that was actually given.
 *
 * This is what `bin/backups` can ask before importing anything else. Modules
 * across the monorepo parse NODE_ENV as they load, and one of them throws a
 * bare `ZodError` at a value it doesn't recognize, so an unrecognized value has
 * to be caught before any of them load. An absent one is left to the CLI, which
 * knows which command is running and can tell the development workspace from a
 * real one — neither of which is knowable this early.
 */
export function checkNodeEnvIfSet(): string | undefined {
  return process.env['NODE_ENV'] === undefined ? undefined : checkNodeEnv();
}
