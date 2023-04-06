/* eslint-disable no-console */
import { MaybePromise, Optional } from '@votingworks/basics';

/**
 * Suppresses console output during the execution of a function. Resolves to the
 * return value of the function.
 */
export function suppressingConsoleOutput<T>(fn: () => Promise<T>): Promise<T>;

/**
 * Suppresses console output during the execution of a function. Returns the
 * return value of the function.
 */
export function suppressingConsoleOutput<T>(fn: () => T): T;

export function suppressingConsoleOutput<T>(
  fn: () => MaybePromise<T>
): MaybePromise<T> {
  jest.spyOn(console, 'log').mockReturnValue();
  jest.spyOn(console, 'warn').mockReturnValue();
  jest.spyOn(console, 'error').mockReturnValue();

  function cleanup() {
    jest.spyOn(console, 'log').mockRestore();
    jest.spyOn(console, 'warn').mockRestore();
    jest.spyOn(console, 'error').mockRestore();
  }

  let value: Optional<MaybePromise<T>>;
  let error: unknown;
  let success = false;

  try {
    value = fn();
    success = true;
  } catch (e) {
    error = e;
  }

  if (!success) {
    cleanup();
    throw error;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Promise<T>).then === 'function'
  ) {
    return (value as Promise<T>).then(
      (v) => {
        cleanup();
        return v;
      },
      (e) => {
        cleanup();
        throw e;
      }
    );
  }

  cleanup();
  return value as T;
}
