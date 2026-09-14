import { assertDefined } from '@votingworks/basics';
import { randomInt } from 'node:crypto';

/**
 * Returns a cryptographically secure random element of `array`, which must not
 * be empty.
 */
export function randomElement<T>(array: ArrayLike<T>): T {
  if (array.length === 0) {
    throw new Error('cannot pick a random element of an empty array');
  }
  return assertDefined(array[randomInt(0, array.length)]);
}

/**
 * Returns a new array with the elements of `array` in a cryptographically
 * secure random order.
 */
export function shuffle<T>(array: readonly T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [result[i], result[j]] = [
      assertDefined(result[j]),
      assertDefined(result[i]),
    ];
  }
  return result;
}
