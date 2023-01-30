import { inGroupsOf } from './in_groups_of';
import { drop, integers, take } from './iterators';

test('without remainder', () => {
  expect(Array.from(inGroupsOf([1, 2, 3, 4, 5, 6, 7, 8, 9], 3))).toEqual([
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ]);
});

test('with remainder', () => {
  expect(Array.from(inGroupsOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3))).toEqual([
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [10],
  ]);
});

test('invalid group size', () => {
  expect(() =>
    Array.from(inGroupsOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0))
  ).toThrow();
});

test('with infinite iterator', () => {
  expect(take(5, inGroupsOf(drop(1, integers()), 3))).toEqual([
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [10, 11, 12],
    [13, 14, 15],
  ]);
});
