import { asSheet, mapSheet } from './hmpb';

test('mapSheet sync', () => {
  expect(mapSheet([1, 2], (x) => x + 1)).toEqual([2, 3]);

  const fn = jest.fn<void, []>();
  mapSheet([1, 2], fn);
  expect(fn).toHaveBeenNthCalledWith(1, 1, 'front', 0);
  expect(fn).toHaveBeenNthCalledWith(2, 2, 'back', 1);
});

test('mapSheet async', async () => {
  expect(await mapSheet([1, 2], (x) => Promise.resolve(x + 1))).toEqual([2, 3]);
});

test('mapSheet multiple sync', () => {
  expect(mapSheet([1, 2], [3, 4], (x, y) => x + y)).toEqual([4, 6]);

  const fn = jest.fn<void, []>();
  mapSheet([1, 2], [3, 4], fn);
  expect(fn).toHaveBeenNthCalledWith(1, 1, 3, 'front', 0);
  expect(fn).toHaveBeenNthCalledWith(2, 2, 4, 'back', 1);
});

test('mapSheet multiple async', async () => {
  expect(
    await mapSheet([1, 2], [3, 4], (x, y) => Promise.resolve(x + y))
  ).toEqual([4, 6]);
});

test('asSheet', () => {
  expect(() => asSheet([])).toThrow();
  expect(() => asSheet([1])).toThrow();
  expect(() => asSheet([1, 2])).not.toThrow();
  expect(() => asSheet([1, 2, 3])).toThrow();
});
