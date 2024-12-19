import { expect, test } from 'vitest';
import { naturals } from './naturals';

test('naturals', () => {
  expect(naturals().take(10).toArray()).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
});
