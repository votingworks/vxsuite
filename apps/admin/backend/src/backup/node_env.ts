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

/**
 * Reports why the machine's identity can't be used, or `undefined` if it can.
 *
 * `getMachineConfig` falls back to a development machine ID and a code version
 * of `dev` when these are unset, which is right for a developer and wrong for a
 * VxAdmin: the manifest is signed, so those values become the backup's recorded
 * provenance, and a later check against the machine's real code version would
 * reject the only backup on the drive. The service manager sets these for the
 * app; a shell run by hand has to be told.
 */
export function checkMachineConfigEnv(): string | undefined {
  if (!isNodeEnvProduction()) {
    return undefined;
  }
  const missing = ['VX_MACHINE_ID', 'VX_CODE_VERSION'].filter(
    (name) => !process.env[name]
  );
  if (missing.length === 0) {
    return undefined;
  }
  return (
    `Missing required ${missing.join(' and ')} env var${
      missing.length > 1 ? 's' : ''
    }. Without ${
      missing.length > 1 ? 'them' : 'it'
    } the backup would be signed as coming from a development machine, and ` +
    `this machine would later refuse to restore it.`
  );
}
