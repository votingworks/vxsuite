import crypto from 'crypto';

import { assert } from './assert';

/**
 * Returns a random integer between min (inclusive) and max (inclusive). Intentionally uses the
 * Node crypto library instead of Math.random to ensure that it's cryptographically secure.
 */
export function getRandomInteger({
  min,
  max,
}: {
  min: number;
  max: number;
}): number {
  assert(Number.isInteger(min), 'min should be an integer');
  assert(Number.isInteger(max), 'max should be an integer');
  assert(min <= max, 'min should be less than or equal to max');

  const range = max - min;
  const byteArray = crypto.randomBytes(4); // 4 bytes for a 32-bit integer
  const randomInteger = byteArray.readUInt32LE(0); // Convert the bytes to an integer
  return min + (randomInteger % (range + 1));
}
