import { Optional } from '@votingworks/types';
import { assert, assertDefined, fail, throwIllegalValue } from './assert';

test('assert', () => {
  assert(true);
  expect(() => assert(false, 'message')).toThrow('message');

  // compile-time test checking that `value`'s type is narrowed by TS
  const value: unknown = 'value';
  assert(typeof value === 'string');
  expect(value.startsWith('v')).toBe(true);
});

test('assertDefined', () => {
  expect(() => assertDefined(undefined, 'message')).toThrow('message');
  expect(() => assertDefined(null, 'message')).toThrow('message');

  // compile-time test checking that `value`'s type is narrowed by TS
  const value = 'value' as Optional<string>;
  assertDefined(value).startsWith('hey');
});

test('fail', () => {
  expect(() => fail('message')).toThrow('message');
});

test('throwIllegalValue enum example', () => {
  enum ABC {
    A,
    B,
    C,
  }

  const abc = ABC.A as ABC;
  switch (abc) {
    case ABC.A:
    case ABC.B:
    case ABC.C:
      break;

    default:
      throwIllegalValue(abc);
  }
});

test('throwIllegalValue invalid example', () => {
  enum ABC {
    A,
    B,
    C,
  }

  const abc = ABC.C as ABC;
  switch (abc) {
    case ABC.A:
    case ABC.B:
      // case ABC.C:
      break;

    default:
      // @ts-expect-error - because it's not narrowed to `never`
      expect(() => throwIllegalValue(abc)).toThrowError('Illegal Value: 2');
  }
});

test('throwIllegalValue display name', () => {
  type Thing = { type: 'car' } | { type: 'dog' } | { type: 'house' };

  const thing = { type: 'hotdog' } as unknown as Thing;
  switch (thing.type) {
    case 'car':
    case 'dog':
    case 'house':
      break;

    default:
      expect(() => throwIllegalValue(thing, 'type')).toThrowError(
        'Illegal Value: hotdog'
      );
  }
});
