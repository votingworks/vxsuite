import { inspect } from 'util';
import { err, isResult, ok, wrapException } from './result';

test('ok is Ok', () => {
  expect(ok(0).isOk()).toEqual(true);
});

test('ok is not Err', () => {
  expect(ok(0).isErr()).toEqual(false);
});

test('ok has contained value', () => {
  const value: unknown = {};
  expect(ok(value).ok()).toEqual(value);
});

test('ok without contained value', () => {
  expect(ok().ok()).toBeUndefined();
});

test('ok has no contained error', () => {
  expect(ok(0).err()).toBeUndefined();
});

test('ok unsafeUnwrap', () => {
  expect(ok(0).unsafeUnwrap()).toEqual(0);
});

test('ok unsafeUnwrapErr', () => {
  expect(() => ok('value').unsafeUnwrapErr()).toThrowError();
});

test('ok assertOk', () => {
  expect(ok(0).assertOk('a value')).toEqual(0);
});

test('ok assertErr', () => {
  expect(() => ok('value').assertErr('an error')).toThrowError('an error');
});

test('ok is Result', () => {
  expect(isResult(ok())).toEqual(true);
});

test('ok inspect', () => {
  expect(inspect(ok(0))).toEqual('ok(0)');
  expect(
    inspect(
      ok({
        a: { nested: { object: 99 } },
      })
    )
  ).toEqual('ok({ a: { nested: [Object] } })');
  expect(inspect(ok(0), undefined, -1)).toEqual('ok(…)');
});

test('err is Err', () => {
  expect(err(0).isErr()).toEqual(true);
});

test('err is not Ok', () => {
  expect(err(0).isOk()).toEqual(false);
});

test('err has contained error', () => {
  const error: unknown = {};
  expect(err(error).err()).toEqual(error);
});

test('err has no contained value', () => {
  expect(err(0).ok()).toBeUndefined();
});

test('err unsafeUnwrap', () => {
  expect(() => err('error').unsafeUnwrap()).toThrowError();
});

test('err unsafeUnwrapErr', () => {
  expect(err('error').unsafeUnwrapErr()).toEqual('error');
});

test('err assertOk', () => {
  expect(() => err('error').assertOk('an error!')).toThrowError('an error!');
});

test('err assertErr', () => {
  expect(err('error').assertErr('what?')).toEqual('error');
});

test('err is Result', () => {
  expect(isResult(err(0))).toEqual(true);
});

test('non-ok/non-err are not Result', () => {
  expect(isResult(0)).toEqual(false);
  expect(isResult('')).toEqual(false);
  expect(isResult(undefined)).toEqual(false);
  expect(isResult({})).toEqual(false);
});

test('err inspect', () => {
  expect(inspect(err(0))).toEqual('err(0)');
  expect(
    inspect(
      err({
        a: { nested: { object: 99 } },
      })
    )
  ).toEqual('err({ a: { nested: [Object] } })');
  expect(inspect(err(0), undefined, -1)).toEqual('err(…)');
});

test('wrapException', () => {
  expect(wrapException(new Error('err')).err()).toEqual(new Error('err'));
  expect(wrapException(0).err()).toEqual(new Error('0'));
});
