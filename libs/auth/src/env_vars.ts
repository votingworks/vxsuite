import { assert } from '@votingworks/basics';

/**
 * Gets an env var and throws an error if it's not set
 */
export function getRequiredEnvVar(envVarName: string): string {
  const value = process.env[envVarName];
  assert(value !== undefined, `Missing required ${envVarName} env var`);
  return value;
}
