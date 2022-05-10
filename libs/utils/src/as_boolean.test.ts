import { asBoolean } from './as_boolean';

test('truthy values', () => {
  expect(asBoolean('true')).toBe(true);
  expect(asBoolean('true ')).toBe(true);
  expect(asBoolean('1')).toBe(true);
  expect(asBoolean('yes')).toBe(true);
  expect(asBoolean('TRUE')).toBe(true);
  expect(asBoolean('YES')).toBe(true);
});

test('falsy values', () => {
  expect(asBoolean()).toBe(false);
  expect(asBoolean('')).toBe(false);
  expect(asBoolean(' ')).toBe(false);
  expect(asBoolean('0')).toBe(false);
  expect(asBoolean('false')).toBe(false);
  expect(asBoolean('no')).toBe(false);
  expect(asBoolean('FALSE')).toBe(false);
});
