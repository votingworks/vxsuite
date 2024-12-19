import { expect, test } from 'vitest';
import { range } from './range';

test('range', () => {
  expect(range(0, 0)).toEqual([]);
  expect(range(0, 1)).toEqual([0]);
  expect(range(0, 2)).toEqual([0, 1]);
  expect(range(0, 3)).toEqual([0, 1, 2]);
  expect(range(1, 1)).toEqual([]);
  expect(range(1, 3)).toEqual([1, 2]);
  expect(range(1, 4)).toEqual([1, 2, 3]);
  expect(range(2, 4)).toEqual([2, 3]);
  expect(range(-2, 0)).toEqual([-2, -1]);
  expect(range(-2, 1)).toEqual([-2, -1, 0]);
  expect(range(-2, 2)).toEqual([-2, -1, 0, 1]);
  expect(() => range(1, 0)).toThrow();
});
