import { expect, test } from 'vitest';
import { mapObject } from './map_object';

test('mapObject', () => {
  expect(
    mapObject(
      {
        noTally: 3,
        yesTally: 10,
      },
      (num) => num + 10
    )
  ).toEqual({
    noTally: 13,
    yesTally: 20,
  });
});

test('mapObject with key in transformer', () => {
  expect(
    mapObject(
      {
        noTally: 3,
        yesTally: 10,
      },
      (num, key) => key + num
    )
  ).toEqual({
    noTally: 'noTally3',
    yesTally: 'yesTally10',
  });
});
