import { expect, test } from 'vitest';
import { map, reduce } from './collections';

test('map with an array', () => {
  const result = map(['a', 'b', 'c'], (value) => value.toUpperCase());
  expect(result).toEqual(['A', 'B', 'C']);
});

test('map with a Map', () => {
  const result = map(
    new Map([
      ['a', 'A'],
      ['b', 'B'],
      ['c', 'C'],
    ]),
    (value) => value.toLowerCase()
  );
  expect(result).toEqual(
    new Map([
      ['a', 'a'],
      ['b', 'b'],
      ['c', 'c'],
    ])
  );
});

test('map with a Set', () => {
  const result = map(new Set(['a', 'b', 'c']), (value) => value.toUpperCase());
  expect(result).toEqual(new Set(['A', 'B', 'C']));
});

test('map with an unsupported collection type', () => {
  expect(() => map(0 as unknown as unknown[], () => 0)).toThrowError(
    'Unsupported collection type'
  );
});

test('reduce with an array', () => {
  const result = reduce(['a', 'b', 'c'], (acc, item) => acc + item, '');
  expect(result).toEqual('abc');
});

test('reduce with a Map', () => {
  const result = reduce(
    new Map([
      ['a', 'A'],
      ['b', 'B'],
      ['c', 'C'],
    ]),
    (acc, item, key) => `${acc}${key}: ${item}\n`,
    ''
  );
  expect(result).toEqual('a: A\nb: B\nc: C\n');
});

test('reduce with a Set', () => {
  const result = reduce(
    new Set(['a', 'b', 'c']),
    (acc, item) => acc + item,
    ''
  );
  expect(result).toEqual('abc');
});

test('reduce with an unsupported collection type', () => {
  expect(() => reduce(0 as unknown as unknown[], () => 0, 0)).toThrowError(
    'Unsupported collection type'
  );
});
