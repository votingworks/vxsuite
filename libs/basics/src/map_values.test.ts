import { mapValues } from './map_values';

test('mapValues', () => {
  expect(mapValues({}, () => 1)).toEqual({});
  expect(mapValues({ a: 1 }, (value) => value * 2)).toEqual({ a: 2 });
  expect(mapValues({ a: 1, b: 2 }, (value) => value * 2)).toEqual({
    a: 2,
    b: 4,
  });
  expect(
    mapValues({ one: 1, two: 2, three: 3 }, (value, key) => `${key}: ${value}`)
  ).toEqual({
    one: 'one: 1',
    two: 'two: 2',
    three: 'three: 3',
  });
});
