import { describe, test, expect } from 'vitest';
import { padWithZeroes } from './strings';

describe('padWithZeroes', () => {
  test('pads a valid number string with 0s when no targetDigits argument is provided', () => {
    expect(padWithZeroes('1')).toEqual('01');
  });

  test('pads a valid number string with 0s when an explicit targetDigits argument is provided', () => {
    expect(padWithZeroes('1', 4)).toEqual('0001');
  });

  test("returns the original string if it's a number but not parsable to an integer", () => {
    expect(padWithZeroes('1.1')).toEqual('1.1');
  });

  test("returns the original string if it's not parsable to an integer", () => {
    expect(padWithZeroes('oops')).toEqual('oops');
  });

  test('returns the original string if its length exceeds `targetDigits`', () => {
    expect(padWithZeroes('1234', 3)).toEqual('1234');
  });
});
