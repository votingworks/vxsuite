import { groupBy } from './group_by';
import { integers } from './iterators';

test('groupBy empty', () => {
  expect(groupBy([], () => 'key')).toEqual(new Map());
});

test('groupBy one key', () => {
  expect(groupBy([1, 2, 3], () => 'key')).toEqual(
    new Map([['key', new Set([1, 2, 3])]])
  );
});

test('groupBy identity key', () => {
  expect(groupBy([1, 2, 3], (a) => a)).toEqual(
    new Map([
      [1, new Set([1])],
      [2, new Set([2])],
      [3, new Set([3])],
    ])
  );
});

test('groupBy property', () => {
  expect(
    groupBy(
      [
        { a: 1, b: 1 },
        { a: 2, b: 2 },
        { a: 1, b: 3 },
      ],
      (item) => item.a
    )
  ).toEqual(
    new Map([
      [
        1,
        new Set([
          { a: 1, b: 1 },
          { a: 1, b: 3 },
        ]),
      ],
      [2, new Set([{ a: 2, b: 2 }])],
    ])
  );
});

test('groupBy from iterable', () => {
  expect(groupBy(integers({ from: 1, through: 10 }), (a) => a % 2)).toEqual(
    new Map([
      [0, new Set([2, 4, 6, 8, 10])],
      [1, new Set([1, 3, 5, 7, 9])],
    ])
  );
});
