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
    Object.getPrototypeOf(value) === Object.prototype &&
    value.constructor.name === Object.name
  );
}

export function isFunction(
  value: unknown
): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}
