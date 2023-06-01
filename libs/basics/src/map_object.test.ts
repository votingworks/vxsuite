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
