import { err, ok } from './generic'

test('ok is Ok', () => {
  expect(ok(0).isOk()).toBe(true)
})

test('ok is not Err', () => {
  expect(ok(0).isErr()).toBe(false)
})

test('ok has contained value', () => {
  const value = {}
  expect(ok(value).ok()).toBe(value)
})

test('ok has no contained error', () => {
  expect(ok(0).err()).toBeUndefined()
})

test('ok andThen', () => {
  expect(
    ok(0)
      .andThen((n) => ok(n + 1))
      .unwrap()
  ).toBe(1)
  expect(
    ok(0)
      .andThen((n) => err(n + 1))
      .unwrapErr()
  ).toBe(1)
})

test('ok map', () => {
  expect(
    ok(0)
      .map((n) => n + 1)
      .unwrap()
  ).toBe(1)
})

test('ok mapErr', () => {
  expect(
    ok(0)
      .mapErr(() => -1)
      .unwrap()
  ).toBe(0)
})

test('ok mapOr', () => {
  expect(ok(0).mapOr(-1, (n) => n + 1)).toBe(1)
})

test('ok mapOrElse', () => {
  expect(
    ok(0).mapOrElse(
      () => -1,
      (n) => n + 1
    )
  ).toBe(1)
})

test('ok unwrap', () => {
  expect(ok(0).unwrap()).toBe(0)
})

test('ok unwrapErr', () => {
  expect(() => ok('value').unwrapErr()).toThrowError('value')
})

test('ok expect', () => {
  expect(ok(0).expect('expected a number')).toBe(0)
})

test('ok expectErr', () => {
  expect(() => ok(0).expectErr('expected an error')).toThrowError(
    'expected an error'
  )
})

test('err is Err', () => {
  expect(err(0).isErr()).toBe(true)
})

test('err is not Ok', () => {
  expect(err(0).isOk()).toBe(false)
})

test('err has contained error', () => {
  const error = {}
  expect(err(error).err()).toBe(error)
})

test('err has no contained value', () => {
  expect(err(0).ok()).toBeUndefined()
})

test('err andThen', () => {
  expect(
    err(0)
      .andThen(() => ok(1))
      .unwrapErr()
  ).toBe(0)
})

test('err map', () => {
  expect(
    err(0)
      .map(() => 1)
      .unwrapErr()
  ).toBe(0)
})

test('err mapErr', () => {
  expect(
    err(0)
      .mapErr((n) => n + 1)
      .unwrapErr()
  ).toEqual(1)
})

test('err mapOr', () => {
  expect(err(0).mapOr(-1, () => 1)).toBe(-1)
})

test('err mapOrElse', () => {
  expect(
    err(0).mapOrElse(
      () => -1,
      () => 1
    )
  ).toBe(-1)
})

test('err unwrap', () => {
  expect(() => err('error').unwrap()).toThrowError('error')
})

test('err unwrapErr', () => {
  expect(err('error').unwrapErr()).toBe('error')
})

test('err expect', () => {
  expect(() => err(0).expect('expected a value')).toThrowError(
    'expected a value'
  )
})

test('err expectErr', () => {
  expect(err(0).expectErr('expected an error')).toBe(0)
})
