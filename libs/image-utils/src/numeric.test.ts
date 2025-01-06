import { expect, test } from 'vitest';
import fc from 'fast-check';
import { assertInteger, EPSILON, isCloseToZero } from './numeric';

test('isCloseToZero', () => {
  expect(isCloseToZero(0)).toEqual(true);
  expect(isCloseToZero(1)).toEqual(false);
  expect(isCloseToZero(-1)).toEqual(false);
  expect(isCloseToZero(EPSILON)).toEqual(true);
  expect(isCloseToZero(-EPSILON)).toEqual(true);
  expect(isCloseToZero(EPSILON * 2)).toEqual(false);
  expect(isCloseToZero(-EPSILON * 2)).toEqual(false);
});

test('isCloseToZero is true for values within EPSILON of zero', () => {
  fc.assert(
    fc.property(fc.float(), (value) => {
      expect(isCloseToZero(value)).toEqual(Math.abs(value) < EPSILON);
    })
  );
});

test('assertInteger throws if value is not an integer', () => {
  fc.assert(
    fc.property(
      fc.float().filter((value) => Math.floor(value) !== value),
      (value) => {
        expect(() => assertInteger(value)).toThrowError();
      }
    )
  );
});

test('assertInteger returns value if it is an integer', () => {
  fc.assert(
    fc.property(fc.integer(), (value) => {
      expect(assertInteger(value)).toEqual(value);
    })
  );
});
