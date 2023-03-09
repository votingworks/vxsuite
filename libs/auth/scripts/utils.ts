import { spawnSync } from 'child_process';
import { assert } from '@votingworks/basics';

/**
 * Checks whether an error contains the specified message
 */
export function errorContains(error: unknown, message: string): boolean {
  return error instanceof Error && error.message.includes(message);
}

/**
 * Gets an env var and throws an error if it's not set
 */
export function getEnvVar(envVarName: string, required = true): string {
  const value = process.env[envVarName];
  if (required) {
    assert(value !== undefined, `Missing required ${envVarName} env var`);
  }
  return value || '';
}

/**
 * Runs the provided shell command, returning the standard output. Throws an error if the process
 * exits with a non-success status code.
 */
export function runCommand(command: string[]): string {
  assert(command[0] !== undefined);
  const { status, stderr, stdout } = spawnSync(command[0], command.slice(1));
  if (status !== 0) {
    throw new Error(stderr.toString());
  }
  return stdout.toString();
}
