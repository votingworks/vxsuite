/* eslint-disable max-classes-per-file */
/* eslint-disable vx/gts-jsdoc */

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && !isArray(value) && value !== null;
}

export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    isObject(value) &&
    Object.getPrototypeOf(Object.getPrototypeOf(value)) === null
  );
}

export function isFunction(
  value: unknown
): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

export function isAsyncGeneratorFunction(
  fn: unknown
): fn is () => AsyncGenerator<unknown> {
  return (
    typeof fn === 'function' && fn.constructor.name === 'AsyncGeneratorFunction'
  );
}

/**
 * Errors that are intended to catch misuse of Grout during development, rather
 * than runtime issues in production.
 */
export class GroutError extends Error {}

/**
 * An unexpected error from the server (e.g. a crash or runtime exception).
 */
export class ServerError extends Error {}
