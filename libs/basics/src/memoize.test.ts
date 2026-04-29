import { expect, test, vi } from 'vitest';
import fc from 'fast-check';
import { memoizeByObject } from './memoize';

interface Key {
  id: number;
}

test('caches result per key object identity', () => {
  const fn = vi.fn((obj: Key) => obj.id * 2);
  const memoized = memoizeByObject(fn);

  const a: Key = { id: 1 };
  const b: Key = { id: 1 }; // same shape, different identity

  expect(memoized(a)).toEqual(2);
  expect(memoized(a)).toEqual(2);
  expect(fn).toHaveBeenCalledTimes(1);

  expect(memoized(b)).toEqual(2);
  expect(fn).toHaveBeenCalledTimes(2);
});

test('caches undefined return values (does not recompute)', () => {
  const fn = vi.fn((): undefined => undefined);
  const memoized = memoizeByObject(fn);

  const key: Key = { id: 0 };
  expect(memoized(key)).toBeUndefined();
  expect(memoized(key)).toBeUndefined();
  expect(fn).toHaveBeenCalledTimes(1);
});

test('property: memoized output matches the underlying function and calls it once per distinct key', () => {
  fc.assert(
    fc.property(
      // Generate a small pool of distinct key objects, then a sequence of
      // indexes selecting which key to call with on each step.
      fc.integer({ min: 1, max: 8 }).chain((numKeys) =>
        fc.record({
          numKeys: fc.constant(numKeys),
          callIndexes: fc.array(fc.integer({ min: 0, max: numKeys - 1 }), {
            minLength: 1,
            maxLength: 50,
          }),
        })
      ),
      ({ numKeys, callIndexes }) => {
        const keys: Key[] = Array.from({ length: numKeys }, (_, i) => ({
          id: i,
        }));
        function compute(obj: Key): number {
          return obj.id * 7 + 3;
        }
        const fn = vi.fn(compute);
        const memoized = memoizeByObject(fn);

        for (const i of callIndexes) {
          const key = keys[i]!;
          expect(memoized(key)).toEqual(compute(key));
        }

        // fn was called exactly once per distinct key actually used.
        const distinctKeysUsed = new Set(callIndexes).size;
        expect(fn).toHaveBeenCalledTimes(distinctKeysUsed);
      }
    )
  );
});
