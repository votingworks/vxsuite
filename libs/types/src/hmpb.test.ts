import { mapSheet } from './hmpb';

test('mapSheet sync', () => {
  expect(mapSheet([1, 2], (x) => x + 1)).toEqual([2, 3]);

  const fn = jest.fn();
  mapSheet([1, 2], fn);
  expect(fn).toHaveBeenNthCalledWith(1, 1, 'front');
  expect(fn).toHaveBeenNthCalledWith(2, 2, 'back');
});

test('mapSheet async', async () => {
  expect(await mapSheet([1, 2], (x) => Promise.resolve(x + 1))).toEqual([2, 3]);
});
