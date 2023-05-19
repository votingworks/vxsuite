import { assert } from '@votingworks/basics';

/**
 * Gets an env var and throws an error if it's not set
 */
export function getRequiredEnvVar<T extends string>(
  envVarName: T
): NonNullable<NodeJS.ProcessEnv[T]> {
  const value = process.env[envVarName];
  assert(value !== undefined, `Missing required ${envVarName} env var`);
  // TS isn't recognizing that the above assertion guarantees that `value` is defined
  return value as NonNullable<NodeJS.ProcessEnv[T]>;
}
