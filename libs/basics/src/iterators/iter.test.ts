import { expect, test } from 'vitest';
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

test('iter with null', async () => {
  expect(iter(null).toArray()).toEqual([]);
  expect(await iter(null).async().toArray()).toEqual([]);
  expect(iter(null).count()).toEqual(0);

  // get a maybe-null array in a way that TS can't tell is null
  const maybeNull = ((): string[] | null => null)();

  // explicit type annotation to ensure that the type is correct
  const maybeStrings: string[] = iter(maybeNull).toArray();
  expect(maybeStrings).toEqual([]);
});

test('iter with undefined', async () => {
  expect(iter(undefined).toArray()).toEqual([]);
  expect(await iter(undefined).async().toArray()).toEqual([]);
  expect(iter(undefined).count()).toEqual(0);

  // get a maybe-undefined array in a way that TS can't tell is undefined
  const maybeUndefined = ((): string[] | undefined => undefined)();

  // explicit type annotation to ensure that the type is correct
  const maybeStrings: string[] = iter(maybeUndefined).toArray();
  expect(maybeStrings).toEqual([]);
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
