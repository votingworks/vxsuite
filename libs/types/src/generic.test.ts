import { asyncResult, AsyncResult, err, ok, Result } from './generic'

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

test('ok without contained value', () => {
  expect(ok().ok()).toBeUndefined()
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

test('mapResult', () => {
  expect(
    ok(0)
      .mapResult((r) => err(r.ok()))
      .mapResult((r) => ok(r.err()))
      .ok()
  ).toEqual(0)
})

test('tap', () => {
  const callback = jest.fn()
  const result = ok(0)
  expect(result.tap(callback)).toBe(result)
  expect(callback).toHaveBeenCalledWith(result)
})

test('async async', async () => {
  expect(await ok(0).async().async().isOk()).toEqual(true)
})

test('async ok is ok', async () => {
  expect(await ok(0).async().isOk()).toEqual(true)
})

test('async ok is not Err', async () => {
  expect(await ok(0).async().isErr()).toBe(false)
})

test('async ok has contained value', async () => {
  const value = {}
  expect(await ok(value).async().ok()).toBe(value)
})

test('async ok without contained value', async () => {
  expect(await ok().async().ok()).toBeUndefined()
})

test('async ok has no contained error', async () => {
  expect(await ok(0).async().err()).toBeUndefined()
})

test('async ok andThen', async () => {
  expect(
    await ok(0)
      .async()
      .andThen((n) => ok(n + 1).async())
      .unwrap()
  ).toBe(1)
  expect(
    await ok(0)
      .async()
      .andThen((n) => err(n + 1))
      .unwrapErr()
  ).toBe(1)
})

test('async ok map', async () => {
  expect(
    await ok(0)
      .async()
      .map((n) => n + 1)
      .unwrap()
  ).toBe(1)
})

test('async ok mapErr', async () => {
  expect(
    await ok(0)
      .async()
      .mapErr(() => -1)
      .unwrap()
  ).toBe(0)
})

test('async ok mapOr', async () => {
  expect(
    await ok(0)
      .async()
      .mapOr(-1, (n) => n + 1)
  ).toBe(1)
})

test('async ok mapOrElse', async () => {
  expect(
    await ok(0)
      .async()
      .mapOrElse(
        () => -1,
        (n) => n + 1
      )
  ).toBe(1)
})

test('async ok unwrap', async () => {
  expect(await ok(0).async().unwrap()).toBe(0)
})

test('async ok unwrapErr', async () => {
  // for some reason `await expect(…).rejects.toThrowError(…)` does not work
  try {
    await ok('value').async().unwrapErr()
    fail()
  } catch (error) {
    expect(error).toBe('value')
  }
})

test('async ok expect', async () => {
  expect(await ok(0).async().expect('expected a number')).toBe(0)
})

test('async ok expectErr', async () => {
  // for some reason `await expect(…).rejects.toThrowError(…)` does not work
  try {
    await ok(0).async().expectErr('expected an error')
    fail()
  } catch (error) {
    expect(error).toBe('expected an error')
  }
})

test('async err is Err', async () => {
  expect(await err(0).async().isErr()).toBe(true)
})

test('async err is not Ok', async () => {
  expect(await err(0).async().isOk()).toBe(false)
})

test('async err has contained error', async () => {
  const error = {}
  expect(await err(error).async().err()).toBe(error)
})

test('async err has no contained value', async () => {
  expect(await err(0).async().ok()).toBeUndefined()
})

test('async err andThen', async () => {
  expect(
    await err(0)
      .async()
      .andThen(() => ok<number, number>(1))
      .unwrapErr()
  ).toBe(0)
})

test('async err map', async () => {
  expect(
    await err(0)
      .async()
      .map(() => 1)
      .map((n) => Promise.resolve(n))
      .unwrapErr()
  ).toBe(0)
})

test('async err mapErr', async () => {
  expect(
    await err(0)
      .async()
      .mapErr((n) => n + 1)
      .mapErr((n) => Promise.resolve(n * 2))
      .unwrapErr()
  ).toEqual(2)
})

test('async err mapOr', async () => {
  expect(
    await err(0)
      .async()
      .mapOr(-1, () => 1)
  ).toBe(-1)
})

test('async err mapOrElse', async () => {
  expect(
    await err(0)
      .async()
      .mapOrElse(
        () => -1,
        () => 1
      )
  ).toBe(-1)
})

test('async err unwrap', async () => {
  // for some reason `await expect(…).rejects.toThrowError(…)` does not work
  try {
    await err('error').async().unwrap()
    fail()
  } catch (error) {
    expect(error).toEqual('error')
  }
})

test('async err unwrapErr', async () => {
  expect(await err('error').async().unwrapErr()).toBe('error')
})

test('async err expect', async () => {
  // for some reason `await expect(…).rejects.toThrowError(…)` does not work
  try {
    await err(0).async().expect('expected a value')
  } catch (error) {
    expect(error).toEqual('expected a value')
  }
})

test('async err expectErr', async () => {
  expect(await err(0).async().expectErr('expected an error')).toBe(0)
})

test('async chains', async () => {
  function getData(): AsyncResult<number[], Error> {
    return asyncResult(Promise.resolve(ok([1, 2, 3])))
  }

  function sum(numbers: readonly number[]): Result<number, Error> {
    return numbers.length === 0
      ? err(new Error('nothing to sum'))
      : ok(numbers.reduce((sum, n) => sum + n, 0))
  }

  function negate(number: number): Result<number, Error> {
    return number === 0 ? err(new Error('cannot negate zero')) : ok(-number)
  }

  expect(await getData().andThen(sum).andThen(negate).ok()).toEqual(-6)
})

test('async mapResult', async () => {
  expect(
    await ok(0)
      .async()
      .mapResult((r) => err(r.ok()))
      .mapResult((r) => ok(r.err()))
      .ok()
  ).toEqual(0)
})

test('async tap', () => {
  const callback = jest.fn()
  const result = ok(0).async()
  expect(result.tap(callback)).toBe(result)
  expect(callback).toHaveBeenCalledWith(result)
})
