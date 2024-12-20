import { expect, test } from 'vitest';
import { asBoolean } from './as_boolean';

test('truthy values', () => {
  expect(asBoolean('true')).toEqual(true);
  expect(asBoolean('true ')).toEqual(true);
  expect(asBoolean('1')).toEqual(true);
  expect(asBoolean('yes')).toEqual(true);
  expect(asBoolean('TRUE')).toEqual(true);
  expect(asBoolean('YES')).toEqual(true);
});

test('falsy values', () => {
  expect(asBoolean()).toEqual(false);
  expect(asBoolean('')).toEqual(false);
  expect(asBoolean(' ')).toEqual(false);
  expect(asBoolean('0')).toEqual(false);
  expect(asBoolean('false')).toEqual(false);
  expect(asBoolean('no')).toEqual(false);
  expect(asBoolean('FALSE')).toEqual(false);
});
