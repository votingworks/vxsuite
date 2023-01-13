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
  expect(isBoolean(true)).toEqual(true);
  expect(isBoolean(false)).toEqual(true);

  expect(isBoolean(null)).toEqual(false);
  expect(isBoolean(undefined)).toEqual(false);
  expect(isBoolean(0)).toEqual(false);
  expect(isBoolean('')).toEqual(false);
  expect(isBoolean([])).toEqual(false);
  expect(isBoolean({})).toEqual(false);
  expect(isBoolean(() => 0)).toEqual(false);
});

test('isNumber', () => {
  expect(isNumber(0)).toEqual(true);
  expect(isNumber(1)).toEqual(true);
  expect(isNumber(-1)).toEqual(true);
  expect(isNumber(NaN)).toEqual(true);
  expect(isNumber(Infinity)).toEqual(true);
  expect(isNumber(-Infinity)).toEqual(true);

  expect(isNumber(null)).toEqual(false);
  expect(isNumber(undefined)).toEqual(false);
  expect(isNumber(true)).toEqual(false);
  expect(isNumber('')).toEqual(false);
  expect(isNumber([])).toEqual(false);
  expect(isNumber({})).toEqual(false);
  expect(isNumber(() => 0)).toEqual(false);
});

test('isString', () => {
  expect(isString('')).toEqual(true);
  expect(isString('some string')).toEqual(true);

  expect(isString(null)).toEqual(false);
  expect(isString(undefined)).toEqual(false);
  expect(isString(true)).toEqual(false);
  expect(isString(0)).toEqual(false);
  expect(isString([])).toEqual(false);
  expect(isString({})).toEqual(false);
  expect(isString(() => 0)).toEqual(false);
});

test('isArray', () => {
  expect(isArray([])).toEqual(true);
  expect(isArray([1, 2, 3])).toEqual(true);

  expect(isArray(null)).toEqual(false);
  expect(isArray(undefined)).toEqual(false);
  expect(isArray(true)).toEqual(false);
  expect(isArray(0)).toEqual(false);
  expect(isArray('')).toEqual(false);
  expect(isArray({})).toEqual(false);
  expect(isArray(() => 0)).toEqual(false);
});

test('isObject', () => {
  expect(isObject({})).toEqual(true);
  expect(isObject({ a: 1, b: 2 })).toEqual(true);
  expect(isObject(new Error())).toEqual(true);
  expect(isObject(ok())).toEqual(true);
  expect(isObject(new Date())).toEqual(true);

  expect(isObject(null)).toEqual(false);
  expect(isObject(undefined)).toEqual(false);
  expect(isObject(true)).toEqual(false);
  expect(isObject(0)).toEqual(false);
  expect(isObject('')).toEqual(false);
  expect(isObject([])).toEqual(false);
  expect(isObject(() => 0)).toEqual(false);
});

test('isPlainObject', () => {
  expect(isPlainObject({})).toEqual(true);
  expect(isPlainObject({ a: 1, b: 2 })).toEqual(true);

  expect(isPlainObject(new Error())).toEqual(false);
  expect(isPlainObject(ok())).toEqual(false);
  expect(isPlainObject(new Date())).toEqual(false);

  expect(isPlainObject(null)).toEqual(false);
  expect(isPlainObject(undefined)).toEqual(false);
  expect(isPlainObject(true)).toEqual(false);
  expect(isPlainObject(0)).toEqual(false);
  expect(isPlainObject('')).toEqual(false);
  expect(isPlainObject([])).toEqual(false);
  expect(isPlainObject(() => 0)).toEqual(false);
});

test('isFunction', () => {
  expect(isFunction(() => 0)).toEqual(true);
  function namedFunction() {
    return 0;
  }
  expect(isFunction(namedFunction)).toEqual(true);

  expect(isFunction(null)).toEqual(false);
  expect(isFunction(undefined)).toEqual(false);
  expect(isFunction(true)).toEqual(false);
  expect(isFunction(0)).toEqual(false);
  expect(isFunction('')).toEqual(false);
  expect(isFunction([])).toEqual(false);
  expect(isFunction({})).toEqual(false);
});
