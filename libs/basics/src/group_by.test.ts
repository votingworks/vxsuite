import { expect, test } from 'vitest';
import { groupBy } from './group_by';

test('groupBy', () => {
  expect(groupBy([], (x) => x)).toEqual([]);
  expect(groupBy([1], (x) => x.toString())).toEqual([['1', [1]]]);
  expect(groupBy([1, 2, 3], (x) => x.toString())).toEqual([
    ['1', [1]],
    ['2', [2]],
    ['3', [3]],
  ]);
  expect(groupBy([1, 2, 1, 3], (x) => x.toString())).toEqual([
    ['1', [1, 1]],
    ['2', [2]],
    ['3', [3]],
  ]);
  expect(
    groupBy(
      [
        { a: [1, 2], b: [3, 4] },
        { a: [5, 6], b: [3, 4] },
        { a: [1, 2], b: [7, 8] },
      ],
      (x) => x.a
    )
  ).toEqual([
    [
      [1, 2],
      [
        { a: [1, 2], b: [3, 4] },
        { a: [1, 2], b: [7, 8] },
      ],
    ],
    [[5, 6], [{ a: [5, 6], b: [3, 4] }]],
  ]);
});
