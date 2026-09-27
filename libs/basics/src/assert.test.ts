import { expect, test } from 'vitest';
import {
  assert,
  assertDefined,
  fail,
  throwIllegalValue,
  assertFalsy,
} from './assert.js';

test('assert', () => {
  assert(true);
  expect(() => assert(false, 'message')).toThrow('message');

  // compile-time test checking that `value`'s type is narrowed by TS
  const value: unknown = 'value';
  assert(typeof value === 'string');
  expect(value.startsWith('v')).toEqual(true);
});

test('assertDefined', () => {
  expect(() => assertDefined(undefined, 'message')).toThrow('message');
  expect(() => assertDefined(null, 'message')).toThrow('message');

  // compile-time test checking that `value`'s type is narrowed by TS
  const value = 'value' as string | undefined;
  assertDefined(value).startsWith('hey');
});

test('fail', () => {
  expect(() => fail('message')).toThrow('message');
});

test('throwIllegalValue invalid example', () => {
  type Thing = { type: 'car' } | { type: 'dog' } | { type: 'house' };

  const thing = { type: 'hotdog' } as unknown as Thing;
  switch (thing.type) {
    case 'car':
    case 'dog':
    case 'house':
      break;

    default:
      expect(() => throwIllegalValue(thing)).toThrow(
        'Illegal Value: [object Object]'
      );
      expect(() => throwIllegalValue(thing, 'type')).toThrow(
        'Illegal Value: hotdog'
      );
  }
});

test('assertFalsy', () => {
  const truthyValue = true as unknown as false;
  expect(() => assertFalsy(truthyValue)).toThrow(
    `Unexpected truthy value: ${truthyValue}`
  );
  expect(() => assertFalsy(0)).not.toThrow();
});
