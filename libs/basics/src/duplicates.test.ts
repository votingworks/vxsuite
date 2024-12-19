import { expect, test } from 'vitest';
import { duplicates } from './duplicates';

test('duplicates', () => {
  expect(duplicates([])).toEqual([]);
  expect(duplicates([1])).toEqual([]);
  expect(duplicates([1, 2])).toEqual([]);
  expect(duplicates([1, 1])).toEqual([1]);
  expect(duplicates([1, 1, 2])).toEqual([1]);
  expect(duplicates([1, 2, 1])).toEqual([1]);
  expect(duplicates([1, 2, 3, 1, 3, 1, 0])).toEqual([1, 3]);
  expect(duplicates(['a', 'b', 'c', 'a', 'c', 'a', 'd'])).toEqual(['a', 'c']);
});
