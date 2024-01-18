import { downloadFile, reorderElement } from './utils';

test('downloadFile cleans up temporary anchor tag', () => {
  downloadFile('http://localhost:1234/file.zip');
  expect(document.getElementsByTagName('a')).toHaveLength(0);
});

test('reorderElement', () => {
  expect(reorderElement([1], 0, 0)).toEqual([1]);
  expect(reorderElement([1, 2, 3], 0, 0)).toEqual([1, 2, 3]);
  expect(reorderElement([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
  expect(reorderElement([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
  expect(reorderElement([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
  expect(reorderElement([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
  expect(reorderElement([1, 2, 3], 2, 2)).toEqual([1, 2, 3]);
  expect(() => reorderElement([], 0, 0)).toThrow();
  expect(() => reorderElement([1, 2, 3], 0, 3)).toThrow();
  expect(() => reorderElement([1, 2, 3], 3, 0)).toThrow();
  expect(() => reorderElement([1, 2, 3], -1, 0)).toThrow();
  expect(() => reorderElement([1, 2, 3], 0, -1)).toThrow();
});
