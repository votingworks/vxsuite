import { Buffer } from 'buffer';
import { createHash, randomBytes } from 'crypto';
import fc from 'fast-check';
import { RandomGenerator } from 'pure-rand';
import { fromBase64, randomBase64, toBase64, sha256 } from '.';
import { getRandomValues, randomGenerator } from './crypto';

beforeEach(() => {
  Object.assign(crypto, {
    getRandomValues: undefined,
    randomBytes: undefined,
  });
});

function incrementingGenerator(seed: number, increment = 1): RandomGenerator {
  let next = seed;

  return {
    next: () => {
      return [next, incrementingGenerator(next + increment, increment)];
    },

    clone: () => {
      return incrementingGenerator(next, increment);
    },

    min: () => {
      return next;
    },

    max: () => {
      return next + increment;
    },

    unsafeNext: () => {
      next += increment;
      return next;
    },
  };
}

test('crypto not available', () => {
  Object.defineProperty(globalThis, 'crypto', { value: undefined });
  expect(() => getRandomValues(new Uint8Array(1))).toThrowError(
    'crypto not available'
  );

  Object.defineProperty(globalThis, 'crypto', { value: {} });
  expect(() => getRandomValues(new Uint8Array(1))).toThrowError(
    'crypto not available'
  );
});

test('getRandomValues when crypto.getRandomValues available', () => {
  crypto.getRandomValues = jest.fn((array) => array);
  const array = new Uint8Array(1);
  expect(getRandomValues(array)).toBe(array);
  expect(crypto.getRandomValues).toHaveBeenCalled();
});

test('getRandomValues when crypto.randomBytes available', () => {
  const crypto = globalThis.crypto as unknown as typeof import('crypto');
  crypto.randomBytes = jest.fn((length) => Buffer.alloc(length).fill(9));
  expect(getRandomValues(new Uint8Array(1))).toEqual(Uint8Array.of(9));
  expect(crypto.randomBytes).toHaveBeenCalled();
});

test('getRandomValues with random generator', () => {
  expect(getRandomValues(new Uint8Array(5), incrementingGenerator(0))).toEqual(
    Uint8Array.of(0, 1, 2, 3, 4)
  );
});

test('randomGenerator', () => {
  (crypto as unknown as typeof import('crypto')).randomBytes = randomBytes;

  const generator = randomGenerator();
  const [value, nextGenerator] = generator.next();
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThanOrEqual(255);
  expect(nextGenerator).toBeDefined();

  expect(generator.clone()).toBe(generator);
  expect(generator.min()).toBe(0);
  expect(generator.max()).toBe(255);
  expect(generator.next()).toEqual(generator.next());

  expect(typeof generator.unsafeNext()).toBe('number');
  expect(generator.next()).toEqual(generator.next());
});

test('randomBase64', () => {
  (crypto as unknown as typeof import('crypto')).randomBytes = randomBytes;

  fc.assert(
    fc.property(fc.integer({ min: 1, max: 300 }), (bytes) => {
      const generator = incrementingGenerator(0);
      expect(randomBase64(bytes, generator)).toEqual(
        randomBase64(bytes, generator)
      );
    })
  );
});

test('toBase64/fromBase64', () => {
  fc.assert(
    fc.property(fc.base64String(), (base64) => {
      expect(fromBase64(toBase64(fromBase64(base64)))).toEqual(
        fromBase64(base64)
      );
    })
  );
});

test('sha256', () => {
  fc.assert(
    fc.property(fc.string(), (string) => {
      expect(sha256(string)).toEqual(
        createHash('sha256').update(string).digest('hex')
      );
    })
  );
});
