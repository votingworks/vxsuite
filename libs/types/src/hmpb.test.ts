import { mapSheet } from './hmpb';

test('mapSheet sync', () => {
  expect(mapSheet([1, 2], (x) => x + 1)).toEqual([2, 3]);
});

test('mapSheet async', async () => {
  expect(await mapSheet([1, 2], (x) => Promise.resolve(x + 1))).toEqual([2, 3]);
});
