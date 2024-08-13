import { generateCombinations } from './utils';

test('generateCombinations', () => {
  expect(generateCombinations([1, 2, 3], 0)).toStrictEqual([]);
  expect(generateCombinations([1, 2, 3], 1)).toStrictEqual([[1], [2], [3]]);
  expect(generateCombinations([1, 2, 3], 2)).toStrictEqual([
    [1, 2],
    [1, 3],
    [2, 3],
  ]);
  expect(generateCombinations([1, 2, 3], 3)).toStrictEqual([[1, 2, 3]]);
  expect(generateCombinations([1, 2, 3], 4)).toStrictEqual([]);
});
