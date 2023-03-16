import { iter } from './iter';

test('iter with array', () => {
  expect(iter([]).toArray()).toEqual([]);
  expect(iter([1, 2, 3]).toArray()).toEqual([1, 2, 3]);
});

test('iter with iterable', () => {
  expect(iter(new Set([1, 2, 3])).toArray()).toEqual([1, 2, 3]);
  expect(
    iter(
      new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ])
    ).toArray()
  ).toEqual([
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ]);
});

test('iter with generator', () => {
  expect(
    iter(
      (function* gen() {
        yield 1;
        yield 2;
        yield 3;
      })()
    ).toArray()
  ).toEqual([1, 2, 3]);
});

test('iter with string', () => {
  expect(iter('abc').toArray()).toEqual(['a', 'b', 'c']);
});

test('iter with async iterable', async () => {
  expect(
    await iter(
      (async function* gen() {
        yield 1;
        yield 2;
        yield await Promise.resolve(3);
      })()
    ).toArray()
  ).toEqual([1, 2, 3]);
});

test('iter with non-iterable', () => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  expect(() => iter({})).toThrowError('iterable is not iterable');
});

test('iter is iterable', () => {
  expect(iter([])[Symbol.iterator]).toBeDefined();

  for (const item of iter([1, 2, 3])) {
    expect(typeof item).toEqual('number');
  }
});

test('iter is async iterable', async () => {
  expect(iter([]).async()[Symbol.asyncIterator]).toBeDefined();

  for await (const item of iter([1, 2, 3])) {
    expect(typeof item).toEqual('number');
  }
});
