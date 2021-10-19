import {
  drop,
  integers,
  map,
  naturals,
  reversed,
  take,
  zip,
  zipMin,
} from './iterators';

test('zip', () => {
  expect([...zip()]).toEqual([]);
  expect([...zip([])]).toEqual([]);
  expect([...zip([1])]).toEqual([[1]]);
  expect([...zip([1], [2])]).toEqual([[1, 2]]);
  expect([...zip([1, 2, 3], [4, 5, 6])]).toEqual([
    [1, 4],
    [2, 5],
    [3, 6],
  ]);

  const numbers = naturals();
  expect(take(5, zip(numbers, numbers))).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
  ]);
});

test('zip length mismatch', () => {
  expect(() => [...zip([1], [])]).toThrowError(
    'not all iterables are the same length'
  );
});

test('zipMin', () => {
  expect([...zipMin()]).toEqual([]);
  expect([...zipMin([])]).toEqual([]);
  expect([...zipMin([], [1])]).toEqual([]);
  expect([...zipMin([], [1])]).toEqual([]);
  expect([...zipMin([1], [2])]).toEqual([[1, 2]]);
  expect([...zipMin([1, 2], [4, 5, 6])]).toEqual([
    [1, 4],
    [2, 5],
  ]);
  expect([...zipMin([1], [2, 3], [4, 5, 6])]).toEqual([[1, 2, 4]]);

  expect(take(3, zip(['a', 'b', 'c'], naturals()))).toEqual([
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ]);
});

test('reversed', () => {
  expect([...reversed([])]).toEqual([]);
  expect([...reversed([1])]).toEqual([1]);
  expect([...reversed([1, 2, 3])]).toEqual([3, 2, 1]);
});

test('map', () => {
  expect([...map([], Boolean)]).toEqual([]);
  expect([...map([0, 1, ''], Boolean)]).toEqual([false, true, false]);
  expect(
    take(
      3,
      map(naturals(), (n) => n * 2)
    )
  ).toEqual([2, 4, 6]);
});

test('take', () => {
  expect(take(0, [])).toEqual([]);
  expect(take(1, [])).toEqual([]);
  expect(take(1, ['a', 'b'])).toEqual(['a']);
  expect(take(1, integers())).toEqual([0]);
  expect(take(5, integers())).toEqual([0, 1, 2, 3, 4]);
  expect(take(-1, [])).toEqual([]);
});

test('drop', () => {
  expect(take(1, drop(1, ['a', 'b']))).toEqual(['b']);
  expect(take(2, drop(2, integers()))).toEqual([2, 3]);
  expect(take(2, drop(0, integers()))).toEqual([0, 1]);
  expect(take(2, drop(-2, integers()))).toEqual([0, 1]);
  expect(take(2, drop(2, [1]))).toEqual([]);
});

test('integers', () => {
  expect([...integers({ from: 0, through: 0 })]).toEqual([0]);
  expect([...integers({ from: 0, through: -1 })]).toEqual([]);
  expect([...integers({ from: 1, through: 1 })]).toEqual([1]);
  expect([...integers({ from: 0, through: 5 })]).toEqual([0, 1, 2, 3, 4, 5]);
  expect([...integers({ from: -2, through: 0 })]).toEqual([-2, -1, 0]);
});
