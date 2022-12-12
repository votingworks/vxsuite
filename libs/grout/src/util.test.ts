import { ok } from '@votingworks/types';
import {
  isArray,
  isBoolean,
  isFunction,
  isNumber,
  isObject,
  isPlainObject,
  isString,
} from './util';

test('isBoolean', () => {
  expect(isBoolean(true)).toBe(true);
  expect(isBoolean(false)).toBe(true);

  expect(isBoolean(null)).toBe(false);
  expect(isBoolean(undefined)).toBe(false);
  expect(isBoolean(0)).toBe(false);
  expect(isBoolean('')).toBe(false);
  expect(isBoolean([])).toBe(false);
  expect(isBoolean({})).toBe(false);
  expect(isBoolean(() => 0)).toBe(false);
});

test('isNumber', () => {
  expect(isNumber(0)).toBe(true);
  expect(isNumber(1)).toBe(true);
  expect(isNumber(-1)).toBe(true);
  expect(isNumber(NaN)).toBe(true);
  expect(isNumber(Infinity)).toBe(true);
  expect(isNumber(-Infinity)).toBe(true);

  expect(isNumber(null)).toBe(false);
  expect(isNumber(undefined)).toBe(false);
  expect(isNumber(true)).toBe(false);
  expect(isNumber('')).toBe(false);
  expect(isNumber([])).toBe(false);
  expect(isNumber({})).toBe(false);
  expect(isNumber(() => 0)).toBe(false);
});

test('isString', () => {
  expect(isString('')).toBe(true);
  expect(isString('some string')).toBe(true);

  expect(isString(null)).toBe(false);
  expect(isString(undefined)).toBe(false);
  expect(isString(true)).toBe(false);
  expect(isString(0)).toBe(false);
  expect(isString([])).toBe(false);
  expect(isString({})).toBe(false);
  expect(isString(() => 0)).toBe(false);
});

test('isArray', () => {
  expect(isArray([])).toBe(true);
  expect(isArray([1, 2, 3])).toBe(true);

  expect(isArray(null)).toBe(false);
  expect(isArray(undefined)).toBe(false);
  expect(isArray(true)).toBe(false);
  expect(isArray(0)).toBe(false);
  expect(isArray('')).toBe(false);
  expect(isArray({})).toBe(false);
  expect(isArray(() => 0)).toBe(false);
});

test('isObject', () => {
  expect(isObject({})).toBe(true);
  expect(isObject({ a: 1, b: 2 })).toBe(true);
  expect(isObject(new Error())).toBe(true);
  expect(isObject(ok())).toBe(true);
  expect(isObject(new Date())).toBe(true);

  expect(isObject(null)).toBe(false);
  expect(isObject(undefined)).toBe(false);
  expect(isObject(true)).toBe(false);
  expect(isObject(0)).toBe(false);
  expect(isObject('')).toBe(false);
  expect(isObject([])).toBe(false);
  expect(isObject(() => 0)).toBe(false);
});

test('isPlainObject', () => {
  expect(isPlainObject({})).toBe(true);
  expect(isPlainObject({ a: 1, b: 2 })).toBe(true);

  expect(isPlainObject(new Error())).toBe(false);
  expect(isPlainObject(ok())).toBe(false);
  expect(isPlainObject(new Date())).toBe(false);

  expect(isPlainObject(null)).toBe(false);
  expect(isPlainObject(undefined)).toBe(false);
  expect(isPlainObject(true)).toBe(false);
  expect(isPlainObject(0)).toBe(false);
  expect(isPlainObject('')).toBe(false);
  expect(isPlainObject([])).toBe(false);
  expect(isPlainObject(() => 0)).toBe(false);
});

test('isFunction', () => {
  expect(isFunction(() => 0)).toBe(true);
  function namedFunction() {
    return 0;
  }
  expect(isFunction(namedFunction)).toBe(true);

  expect(isFunction(null)).toBe(false);
  expect(isFunction(undefined)).toBe(false);
  expect(isFunction(true)).toBe(false);
  expect(isFunction(0)).toBe(false);
  expect(isFunction('')).toBe(false);
  expect(isFunction([])).toBe(false);
  expect(isFunction({})).toBe(false);
});
