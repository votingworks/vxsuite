import { float, int } from './types';

/**
 * A tiny value that is effectively zero.
 */
export const EPSILON = 1e-6;

/**
 * Returns true if the given value is approximately zero.
 */
export function isCloseToZero(value: float): boolean {
  return Math.abs(value) <= EPSILON;
}

/**
 * Returns its argument if it is an integer, otherwise throws.
 */
export function assertInteger(value: number): int {
  if (Math.floor(value) !== value) {
    throw new Error(`Expected integer, got ${value}`);
  }
  return value;
}
