import { err, ok } from './generic';

test('ok is Ok', () => {
  expect(ok(0).isOk()).toBe(true);
});

test('ok is not Err', () => {
  expect(ok(0).isErr()).toBe(false);
});

test('ok has contained value', () => {
  const value = {};
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
  expect(() => ok('value').unsafeUnwrapErr()).toThrowError('value');
});

test('err is Err', () => {
  expect(err(0).isErr()).toBe(true);
});

test('err is not Ok', () => {
  expect(err(0).isOk()).toBe(false);
});

test('err has contained error', () => {
  const error = {};
  expect(err(error).err()).toBe(error);
});

test('err has no contained value', () => {
  expect(err(0).ok()).toBeUndefined();
});

test('err unsafeUnwrap', () => {
  expect(() => err('error').unsafeUnwrap()).toThrowError('error');
});

test('err unsafeUnwrapErr', () => {
  expect(err('error').unsafeUnwrapErr()).toBe('error');
});
