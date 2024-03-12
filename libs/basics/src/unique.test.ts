import { unique, uniqueBy, uniqueDeep } from './unique';

test('unique', () => {
  expect(unique([])).toEqual([]);
  expect(unique(['a'])).toEqual(['a']);
  expect(unique(['a', 'a'])).toEqual(['a']);
  expect(unique(['a', 'b', 'a'])).toEqual(['a', 'b']);
  expect(unique(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  expect(unique(['a', 'b', 'c', 'a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
});

test('uniqueBy', () => {
  expect(uniqueBy([], (x) => x)).toEqual([]);
  expect(uniqueBy(['a'], (x) => x)).toEqual(['a']);
  expect(uniqueBy(['a', 'a'], (x) => x)).toEqual(['a']);
  expect(uniqueBy(['a', 'b', 'a'], (x) => x)).toEqual(['a', 'b']);
  expect(uniqueBy(['a', 'b', 'c'], (x) => x)).toEqual(['a', 'b', 'c']);
  expect(uniqueBy(['a', 'b', 'c', 'a', 'b', 'c'], (x) => x)).toEqual([
    'a',
    'b',
    'c',
  ]);
  expect(
    uniqueBy([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'a' }], (x) => x.id)
  ).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
});

test('uniqueDeep', () => {
  expect(uniqueDeep([])).toEqual([]);
  expect(uniqueDeep(['a'])).toEqual(['a']);
  expect(uniqueDeep(['a', 'a'])).toEqual(['a']);
  expect(uniqueDeep(['a', 'b', 'a'])).toEqual(['a', 'b']);
  expect(uniqueDeep([{ id: 'a' }, { id: 'b' }, { id: 'a' }])).toEqual([
    { id: 'a' },
    { id: 'b' },
  ]);
  expect(
    uniqueDeep([
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' },
      { id: 'c', name: 'Charles' },
      { id: 'a', name: 'Amanda' },
      { id: 'b', name: 'Bob' },
      { id: 'c', name: 'Charles' },
    ])
  ).toEqual([
    { id: 'a', name: 'Alice' },
    { id: 'b', name: 'Bob' },
    { id: 'c', name: 'Charles' },
    { id: 'a', name: 'Amanda' },
  ]);
});
