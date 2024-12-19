import { expect, test } from 'vitest';
import { integers } from './integers';

test('integers', () => {
  expect(integers({ from: 4 }).take(5).toArray()).toEqual([4, 5, 6, 7, 8]);
  expect(integers({ from: 0, through: 0 }).toArray()).toEqual([0]);
  expect(integers({ from: 0, through: -1 }).toArray()).toEqual([]);
  expect(integers({ from: 1, through: 1 }).toArray()).toEqual([1]);
  expect(integers({ from: 0, through: 5 }).toArray()).toEqual([
    0, 1, 2, 3, 4, 5,
  ]);
  expect(integers({ from: -2, through: 0 }).toArray()).toEqual([-2, -1, 0]);
});
