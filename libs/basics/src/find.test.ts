import { expect, test } from 'vitest';
import { assertFindIndex, find } from './find.js';

test('assertFindIndex', () => {
  expect(assertFindIndex(['A', 'B', 'C'], (n) => n === 'B')).toEqual(1);
  expect(assertFindIndex(['A', 'B', 'C'], (n) => n === 'C')).toEqual(2);

  expect(() => assertFindIndex(['A'], (n) => n === 'B', 'not found')).toThrow(
    'not found'
  );
});

test('find', () => {
  expect(find([1, 2, 3, 4], (number: number) => number > 2, 10)).toEqual(3);
  expect(find([1, 2, 3, 4], (number: number) => number > 20, 10)).toEqual(10);

  expect(find(['mirrorball', 'daylight'], (s) => s === 'mirrorball')).toEqual(
    'mirrorball'
  );
  expect(() => find(['mirrorball', 'daylight'], (s) => s === '')).toThrow();
});
