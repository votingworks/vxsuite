export interface Dictionary<T> {
  [key: string]: Optional<T>
}
export type Optional<T> = T | undefined
export interface Provider<T> {
  get(): Promise<T>
}

/**
 * Represents either success with a value `T` or failure with error `E`.
 */
export interface Result<T, E> {
  /**
   * Returns `true` if the result is `Ok`.
   */
  isOk(): this is Ok<T>

  /**
   * Returns `true` if the result is `Err`.
   */
  isErr(): this is Err<E>

  /**
   * Returns the value if result is `Ok`, otherwise undefined.
   */
  ok(): Optional<T>

  /**
   * Returns the error if result is `Err`, otherwise undefined.
   */
  err(): Optional<E>

  /**
   * Maps a `Result<T, E>` to `Result<U, E>` by applying `fn` to an `Ok` value,
   * leaving an `Err` value untouched.
   *
   * @example
   *
   *   const times2 = (n: number) => n * 2
   *   console.log(ok(1).map(times2).ok()) // logs `2`
   *   console.log(err(-1).map(times2).ok()) // logs `undefined`
   */
  map<U>(fn: (value: T) => U): Result<U, E>

  /**
   * Applies `fn` to a contained `Ok` value or returns `defaultValue` for `Err`.
   *
   * @example
   *
   *   const times2 = (n: number) => n * 2
   *   console.log(ok(1).mapOr(-1, times2)) // logs `2`
   *   console.log(err(NaN).mapOr(-1, times2)) // logs `-1`
   */
  mapOr<U>(defaultValue: U, fn: (value: T) => U): U

  /**
   * Applies `fn` to a contained `Ok` value or `defaultFn` to a contained `Err`
   * error.
   *
   * @example
   *
   *   const times2 = (n: number) => n * 2
   *   console.log(ok(1).mapOrElse(() => -1, times2)) // logs `2`
   *   console.log(err(NaN).mapOrElse(() => -1, times2)) // logs `-1`
   */
  mapOrElse<U>(defaultFn: (error: E) => U, fn: (value: T) => U): U

  /**
   * Returns a contained `Ok` value, or throws a contained `Err` error.
   *
   * @example
   *
   *   console.log(ok(1).unwrap()) // logs `1`
   *   console.log(err(NaN).unwrap()) // throws `NaN`
   */
  unwrap(): T

  /**
   * Returns a contained `Err` error, or throws a contained `Ok` value.
   *
   * @example
   *
   *   console.log(ok(1).unwrapErr()) // throws `1`
   *   console.log(err(NaN).unwrapErr()) // logs `NaN`
   */
  unwrapErr(): E

  /**
   * Returns a contained `Ok` value, or throws `throwable`.
   *
   * @example
   *
   *   console.log(ok(1).expect('expected a number')) // logs `1`
   *   console.log(err(NaN).expect('expected a number')) // throws 'expected a number'
   */
  expect(throwable: unknown): T

  /**
   * Returns a contained `Err` error, or throws `throwable`.
   *
   * @example
   *
   *   console.log(ok(1).expectErr('expected an error')) // throws 'expected an error'
   *   console.log(err(NaN).expectErr('expected an error')) // logs `NaN`
   */
  expectErr(throwable: unknown): E
}

export interface Ok<T> extends Result<T, never> {
  /**
   * Returns `true`.
   */
  isOk(): true

  /**
   * Returns `false`.
   */
  isErr(): false

  /**
   * Returns the contained value.
   */
  ok(): T

  /**
   * Returns `undefined`.
   */
  err(): undefined

  /**
   * Applies `fn` to the contained value and returns the result.
   */
  map<U>(fn: (value: T) => U): Ok<U>

  /**
   * Applies `fn` to the contained value and returns the result.
   */
  mapOr<U>(defaultValue: U, fn: (value: T) => U): U

  /**
   * Applies `fn` to the contained value and returns the result.
   */
  mapOrElse<U>(defaultFn: (error: never) => U, fn: (value: T) => U): U

  /**
   * Returns the contained value.
   */
  unwrap(): T

  /**
   * Throws the contained value.
   */
  unwrapErr(): never

  /**
   * Returns the contained value.
   */
  expect(throwable: unknown): T

  /**
   * Throws `throwable`.
   */
  expectErr(throwable: unknown): never
}

export interface Err<E> extends Result<never, E> {
  /**
   * Returns `false`.
   */
  isOk(): false

  /**
   * Returns `true`.
   */
  isErr(): true

  /**
   * Returns `undefined`.
   */
  ok(): undefined

  /**
   * Returns the contained error.
   */
  err(): E

  /**
   * Returns a new `Err` wrapping the contained error.
   */
  map<U>(fn: (value: never) => U): Err<E>

  /**
   * Returns `defaultValue`.
   */
  mapOr<U>(defaultValue: U, fn: (value: never) => U): U

  /**
   * Calls `defaultFn` and returns the result.
   */
  mapOrElse<U>(defaultFn: (error: E) => U, fn: (value: never) => U): U

  /**
   * Throws the contained error.
   */
  unwrap(): never

  /**
   * Returns the contained error.
   */
  unwrapErr(): E

  /**
   * Throws `throwable`.
   */
  expect(throwable: unknown): never

  /**
   * Returns the contained error.
   */
  expectErr(throwable: unknown): E
}

export function ok<T, E>(value: T): Result<T, E> {
  return {
    isOk: () => true,
    isErr: () => false,
    ok: () => value,
    err: () => undefined,
    map: (fn) => ok(fn(value)),
    mapOr: (_defaultValue, fn) => fn(value),
    mapOrElse: (_defaultFn, fn) => fn(value),
    unwrap: () => value,
    unwrapErr: () => {
      throw value
    },
    expect: () => value,
    expectErr: (throwable) => {
      throw throwable
    },
  }
}

export function err<T, E>(error: E): Result<T, E> {
  return {
    isOk: () => false,
    isErr: () => true,
    ok: () => undefined,
    err: () => error,
    map: () => err(error),
    mapOr: (defaultValue) => defaultValue,
    mapOrElse: (defaultFn) => defaultFn(error),
    unwrap: () => {
      throw error
    },
    unwrapErr: () => error,
    expect: (throwable) => {
      throw throwable
    },
    expectErr: () => error,
  }
}
