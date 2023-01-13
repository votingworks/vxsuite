import { KeyedMap } from './keyed_map';

test('empty map', () => {
  const map = new KeyedMap((key) => key);
  expect(map.has(0)).toEqual(false);
  expect(map.get(0)).toBeUndefined();
  expect(map.delete(0)).toEqual(false);
});

test('adding to map', () => {
  const map = new KeyedMap((key) => key);
  map.set(0, 'a');
  expect(map.has(0)).toEqual(true);
  expect(map.get(0)).toEqual('a');
});

test('deleting from map', () => {
  const map = new KeyedMap((key) => key);
  map.set(0, 'a');
  expect(map.has(0)).toEqual(true);
  map.delete(0);
  expect(map.has(0)).toEqual(false);
});

test('key collisions', () => {
  const map = new KeyedMap(() => 1);
  map.set(0, 'a');
  expect(map.get(0)).toEqual('a');
  expect(map.get(1)).toEqual('a');
  expect(map.get(2)).toEqual('a');
  map.set(1, 'b');
  expect(map.get(0)).toEqual('b');
  expect(map.get(1)).toEqual('b');
  expect(map.get(2)).toEqual('b');
});
