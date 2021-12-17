import {
  fromByteArray as toBase64,
  toByteArray as fromBase64,
} from 'base64-js';
import { sha256 } from 'js-sha256';
import { RandomGenerator } from 'pure-rand';
import { assert } from './assert';

export { sha256, toBase64, fromBase64 };

/**
 * Get random values to fill a typed array. Modifies the array in place. Uses
 * crypto from the host environment if available.
 */
function getRandomValuesInternal(array: Uint8Array): Uint8Array {
  if (typeof crypto === 'undefined') {
    throw new Error('crypto not available');
  }

  if (typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(array);
  }

  const { randomBytes } = crypto as unknown as {
    randomBytes: typeof import('crypto').randomBytes;
  };
  if (typeof randomBytes === 'function') {
    array.set(randomBytes(array.length));
    return array;
  }

  throw new Error('crypto not available');
}

/**
 * Gets a random byte value using the host environment's crypto.
 */
function randomByte(): number {
  const bytes = new Uint8Array(1);
  getRandomValuesInternal(bytes);
  const byte = bytes[0];
  assert(typeof byte === 'number');
  return byte;
}

/**
 * Builds a random number generator that returns both a value and the next
 * random number generator in the sequence.
 */
export function randomGenerator(): RandomGenerator {
  let byte = randomByte();
  let nextGenerator: RandomGenerator | undefined;

  const result: RandomGenerator = {
    next: () => {
      assert(typeof byte === 'number');
      nextGenerator ??= randomGenerator();
      return [byte, nextGenerator];
    },

    clone: () => {
      return result;
    },

    min: () => {
      return 0;
    },

    max: () => {
      return 255;
    },

    unsafeNext: () => {
      [byte, nextGenerator] = result.next();
      return byte;
    },
  };

  return result;
}

/**
 * Get random values to fill a typed array. Modifies the array in place.
 * Optionally takes a random number generator to possibly make it deterministic.
 */
export function getRandomValues(
  array: Uint8Array,
  gen = randomGenerator()
): Uint8Array {
  let nextByte = 0;
  let nextGen = gen;
  for (let i = 0; i < array.length; i += 1) {
    [nextByte, nextGen] = nextGen.next();
    array.set([nextByte], i);
  }
  return array;
}

/**
 * Get random base64 string with `numBytes` bytes. Optionally takes a random
 * number generator to possibly make it deterministic.
 */
export function randomBase64(numBytes: number, gen?: RandomGenerator): string {
  const array = new Uint8Array(numBytes);
  return toBase64(getRandomValues(array, gen)).replace(/=+$/, '');
}
