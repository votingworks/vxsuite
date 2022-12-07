import { inspect } from 'util';
import { err, isResult, ok, wrapException } from './result';

test('ok is Ok', () => {
  expect(ok(0).isOk()).toBe(true);
});

test('ok is not Err', () => {
  expect(ok(0).isErr()).toBe(false);
});

test('ok has contained value', () => {
  const value: unknown = {};
  expect(ok(value).ok()).toBe(value);
});

test('ok without contained value', () => {
  expect(ok().ok()).toBeUndefined();
});

test('ok has no contained error', () => {
  expect(ok(0).err()).toBeUndefined();
});

test('ok unsafeUnwrap', () => {
  expect(ok(0).unsafeUnwrap()).toBe(0);
});

test('ok unsafeUnwrapErr', () => {
  expect(() => ok('value').unsafeUnwrapErr()).toThrowError();
});

test('ok assertOk', () => {
  expect(ok(0).assertOk('a value')).toBe(0);
});

test('ok assertErr', () => {
  expect(() => ok('value').assertErr('an error')).toThrowError('an error');
});

test('ok is Result', () => {
  expect(isResult(ok())).toBe(true);
});

test('ok inspect', () => {
  expect(inspect(ok(0))).toBe('ok(0)');
  expect(
    inspect(
      ok({
        a: { nested: { object: 99 } },
      })
    )
  ).toBe('ok({ a: { nested: [Object] } })');
  expect(inspect(ok(0), undefined, -1)).toBe('ok(…)');
});

test('err is Err', () => {
  expect(err(0).isErr()).toBe(true);
});

test('err is not Ok', () => {
  expect(err(0).isOk()).toBe(false);
});

test('err has contained error', () => {
  const error: unknown = {};
  expect(err(error).err()).toBe(error);
});

test('err has no contained value', () => {
  expect(err(0).ok()).toBeUndefined();
});

test('err unsafeUnwrap', () => {
  expect(() => err('error').unsafeUnwrap()).toThrowError();
});

test('err unsafeUnwrapErr', () => {
  expect(err('error').unsafeUnwrapErr()).toBe('error');
});

test('err assertOk', () => {
  expect(() => err('error').assertOk('an error!')).toThrowError('an error!');
});

test('err assertOkErr', () => {
  expect(err('error').assertErr('what?')).toBe('error');
});

test('err is Result', () => {
  expect(isResult(err(0))).toBe(true);
});

test('non-ok/non-err are not Result', () => {
  expect(isResult(0)).toBe(false);
  expect(isResult('')).toBe(false);
  expect(isResult(undefined)).toBe(false);
  expect(isResult({})).toBe(false);
});

test('err inspect', () => {
  expect(inspect(err(0))).toBe('err(0)');
  expect(
    inspect(
      err({
        a: { nested: { object: 99 } },
      })
    )
  ).toBe('err({ a: { nested: [Object] } })');
  expect(inspect(err(0), undefined, -1)).toBe('err(…)');
});

test('wrapException', () => {
  expect(wrapException(new Error('err')).err()).toEqual(new Error('err'));
  expect(wrapException(0).err()).toEqual(new Error('0'));
});
