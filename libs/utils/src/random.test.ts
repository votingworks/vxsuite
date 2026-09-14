import fc from 'fast-check';
import { expect, test } from 'vitest';
import { randomElement, shuffle } from './random';

test('randomElement returns an element of the array', () => {
  const array = ['a', 'b', 'c'];
  for (let i = 0; i < 50; i += 1) {
    expect(array).toContain(randomElement(array));
  }
});

test('randomElement rejects an empty array', () => {
  expect(() => randomElement([])).toThrow('empty array');
});

test('shuffle preserves the elements', () => {
  fc.assert(
    fc.property(fc.array(fc.integer()), (array) => {
      expect([...shuffle(array)].sort()).toEqual([...array].sort());
    })
  );
});

test('shuffle does not mutate its input', () => {
  const array = [1, 2, 3, 4, 5];
  shuffle(array);
  expect(array).toEqual([1, 2, 3, 4, 5]);
});

test('shuffle reorders', () => {
  const array = [1, 2, 3, 4, 5, 6, 7, 8];
  const shuffles = new Set(
    Array.from({ length: 50 }, () => shuffle(array).join(','))
  );
  expect(shuffles.size).toBeGreaterThan(1);
});
