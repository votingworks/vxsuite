import KeyedMap from './KeyedMap';

test('empty map', () => {
  const map = new KeyedMap((key) => key);
  expect(map.has(0)).toBe(false);
  expect(map.get(0)).toBeUndefined();
  expect(map.delete(0)).toBe(false);
});

test('adding to map', () => {
  const map = new KeyedMap((key) => key);
  map.set(0, 'a');
  expect(map.has(0)).toBe(true);
  expect(map.get(0)).toBe('a');
});

test('deleting from map', () => {
  const map = new KeyedMap((key) => key);
  map.set(0, 'a');
  expect(map.has(0)).toBe(true);
  map.delete(0);
  expect(map.has(0)).toBe(false);
});

test('key collisions', () => {
  const map = new KeyedMap(() => 1);
  map.set(0, 'a');
  expect(map.get(0)).toBe('a');
  expect(map.get(1)).toBe('a');
  expect(map.get(2)).toBe('a');
  map.set(1, 'b');
  expect(map.get(0)).toBe('b');
  expect(map.get(1)).toBe('b');
  expect(map.get(2)).toBe('b');
});
