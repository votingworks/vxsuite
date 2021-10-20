import { Uint8 } from './types';

/**
 * Generates a series of bitmasks in little-endian order.
 *
 * @example
 *
 * makeMasks(0) // []
 * makeMasks(1) // [0b1]
 * makeMasks(2) // [0b10, 0b01]
 * makeMasks(3) // [0b100, 0b010, 0b001]
 */
export function makeMasks<T extends number>(count: number): T[] {
  const results: T[] = [];

  for (let i = count - 1; i >= 0; i -= 1) {
    results.push((1 << i) as T);
  }

  return results;
}

/**
 * Coerces `number` to a `Uint8` by asserting it is in the range of `Uint8`.
 *
 * @throws if `number` is outside the range of `Uint8` or is not an integer
 */
export function toUint8(number: unknown): Uint8 {
  if (
    typeof number !== 'number' ||
    number < 0x00 ||
    number > 0xff ||
    (number | 0) !== number
  ) {
    throw new TypeError(`cannot convert number to Uint8: ${number}`);
  }
  return number as Uint8;
}

/**
 * Gets the size in bits of a number.
 *
 * @param number a non-negative integer
 * @returns the minimum number of bits required to represent `number`
 * @throws if `number` is negative or is not an integer
 */
export function sizeof(number: number): number {
  if (number < 0 || (number | 0) !== number) {
    throw new TypeError(
      `cannot get size of negative or non-integer: ${number}`
    );
  }

  let maxBits = 1;

  let shifted = number;
  // eslint-disable-next-line no-cond-assign
  while ((shifted >>= 1)) {
    maxBits += 1;
  }

  return maxBits;
}

/**
 * Groups `array` into arrays of size `count`.
 */
export function inGroupsOf<T>(count: number, array: T[]): Array<T[]> {
  const result: Array<T[]> = [];

  for (let i = 0; i < array.length; i += count) {
    result.push(array.slice(i, i + count));
  }

  return result;
}
