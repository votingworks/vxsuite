import { sum } from './math';

test('sum', () => {
  expect(sum([])).toBe(0);
  expect(sum([1])).toBe(1);
  expect(sum([1, 2])).toBe(3);
  expect(sum([1, 2, 3])).toBe(6);
  expect(sum([-1, 0, 1, 3.14])).toBe(3.14);
});
