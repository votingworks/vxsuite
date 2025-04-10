import { test, expect } from 'vitest';
import { bisect } from './nh_ballot_template';

test('bisect', async () => {
  let array = [1, 2, 2, 2, 3];
  expect(await bisect(array, (i) => array[i] < 1)).toEqual(0);
  expect(await bisect(array, (i) => array[i] < 2)).toEqual(1);
  expect(await bisect(array, (i) => array[i] < 3)).toEqual(4);
  expect(await bisect(array, (i) => array[i] < 4)).toEqual(5);
  array = [1, 2, 2, 2, 2, 3];
  expect(await bisect(array, (i) => array[i] < 1)).toEqual(0);
  expect(await bisect(array, (i) => array[i] < 2)).toEqual(1);
  expect(await bisect(array, (i) => array[i] < 3)).toEqual(5);
  expect(await bisect(array, (i) => array[i] < 4)).toEqual(6);
  array = [1, 2, 2, 2, 2, 2, 2, 2, 2, 3];
  expect(await bisect(array, (i) => array[i] < 1)).toEqual(0);
  expect(await bisect(array, (i) => array[i] < 2)).toEqual(1);
  expect(await bisect(array, (i) => array[i] < 3)).toEqual(9);
  expect(await bisect(array, (i) => array[i] < 4)).toEqual(10);
});
