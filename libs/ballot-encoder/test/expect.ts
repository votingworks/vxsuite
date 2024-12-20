import { expect } from 'vitest';

declare global {
  // eslint-disable-next-line
  namespace jest {
    // eslint-disable-next-line
    interface Matchers<R = void, T = {}> {
      toEqualBits(buffer: Uint8Array): R;
    }
  }
}

/**
 * Groups `array` into arrays of size `count`.
 */
function inGroupsOf<T>(count: number, array: T[]): Array<T[]> {
  const result: Array<T[]> = [];

  for (let i = 0; i < array.length; i += count) {
    result.push(array.slice(i, i + count));
  }

  return result;
}

function asBinaryString(buffer: Uint8Array): string {
  return inGroupsOf(
    8,
    Array.from(buffer).map((n) => n.toString(2).padStart(8, '0'))
  )
    .map((group) => group.join(' '))
    .join('\n');
}

expect.extend({
  toEqualBits(received: Uint8Array, expected: Uint8Array) {
    return {
      pass: this.equals(received, expected),
      message: (): string =>
        this.utils.diff(asBinaryString(received), asBinaryString(expected)) ||
        '',
    };
  },
});
