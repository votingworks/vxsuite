import { expect, test } from 'vitest';
import { mergeObjects } from './merge_objects';

test('mergeObjects', () => {
  expect(mergeObjects({}, {})).toEqual({});

  expect(mergeObjects({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  expect(mergeObjects({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  expect(mergeObjects({ a: 1, b: 1 }, { a: 2, c: 2 })).toEqual({
    a: 2,
    b: 1,
    c: 2,
  });

  expect(mergeObjects({ a: { x: 1 } }, { a: { y: 2 } })).toEqual({
    a: { x: 1, y: 2 },
  });
  expect(mergeObjects({ a: { x: 1 } }, { a: { x: 2 } })).toEqual({
    a: { x: 2 },
  });
  expect(
    mergeObjects(
      {
        a: { x: 1 },
        b: { x: 1, y: 1 },
      },
      {
        a: { x: 2, y: 2 },
        c: { x: 1 },
      }
    )
  ).toEqual({
    a: { x: 2, y: 2 },
    b: { x: 1, y: 1 },
    c: { x: 1 },
  });

  expect(
    mergeObjects(
      {
        a: { x: { j: 1, k: 1 } },
      },
      {
        a: { x: { j: 2, l: 2 } },
      }
    )
  ).toEqual({
    a: { x: { j: 2, k: 1, l: 2 } },
  });

  expect(() => mergeObjects({ a: 1 }, { a: { b: 2 } })).toThrow();
  expect(() => mergeObjects({ a: { b: 1 } }, { a: 2 })).toThrow();
  expect(() => mergeObjects({ a: 1 }, { a: [2] })).toThrow();
  expect(() => mergeObjects({ a: [1] }, { a: 2 })).toThrow();
});
