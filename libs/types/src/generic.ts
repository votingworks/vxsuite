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
   * Gets an async version of this result.
   */
  async(): AsyncResult<T, E>

  /**
   * Returns `this`.
   */
  toResult(): this

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
   * Maps a `Result<T, E>` to `Result<T, F>` by applying `fn` to an `Err` value,
   * leaving an `Ok` value untouched.
   *
   * @example
   *
   *   const times2 = (n: number) => n * 2
   *   console.log(ok(1).mapErr(times2).ok()) // logs `1`
   *   console.log(err(-1).mapErr(times2).err()) // logs `-2`
   */
  mapErr<F>(fn: (error: E) => F): Result<T, F>

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
   * Applies `fn` to a contained `Ok` value for a new `Result`, or returns `Err`
   * as-is.
   */
  andThen<U, F>(fn: (value: T) => Result<U, F>): Result<U, E | F>

  /**
   * Applies `fn` to the result, returning whatever `fn` returns.
   */
  mapResult<U>(fn: (result: this) => U): U

  /**
   * Applies `fn` to the result, returning the same result.
   */
  tap(fn: (result: this) => void): this

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

export interface AsyncResult<T, E> {
  /**
   * Gets `this`.
   */
  async(): this

  /**
   * Resolves to a `Result` for the same values.
   */
  toResult(): Promise<Result<T, E>>

  /**
   * Returns `true` if the result is `Ok`.
   */
  isOk(): Promise<boolean>

  /**
   * Returns `true` if the result is `Err`.
   */
  isErr(): Promise<boolean>

  /**
   * Returns the value if result is `Ok`, otherwise undefined.
   */
  ok(): Promise<Optional<T>>

  /**
   * Returns the error if result is `Err`, otherwise undefined.
   */
  err(): Promise<Optional<E>>

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
  map<U>(fn: (value: T) => U | Promise<U>): AsyncResult<U, E>

  /**
   * Maps a `Result<T, E>` to `Result<T, F>` by applying `fn` to an `Err` value,
   * leaving an `Ok` value untouched.
   *
   * @example
   *
   *   const times2 = (n: number) => n * 2
   *   console.log(ok(1).mapErr(times2).ok()) // logs `1`
   *   console.log(err(-1).mapErr(times2).err()) // logs `-2`
   */
  mapErr<F>(fn: (error: E) => F | Promise<F>): AsyncResult<T, F>

  /**
   * Applies `fn` to a contained `Ok` value or returns `defaultValue` for `Err`.
   *
   * @example
   *
   *   const times2 = (n: number) => n * 2
   *   console.log(ok(1).mapOr(-1, times2)) // logs `2`
   *   console.log(err(NaN).mapOr(-1, times2)) // logs `-1`
   */
  mapOr<U>(
    defaultValue: U | Promise<U>,
    fn: (value: T) => U | Promise<U>
  ): Promise<U>

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
  mapOrElse<U>(
    defaultFn: (error: E) => U | Promise<U>,
    fn: (value: T) => U | Promise<U>
  ): Promise<U>

  /**
   * Applies `fn` to a contained `Ok` value for a new `Result`, or returns `Err`
   * as-is.
   */
  andThen<U, F>(
    fn: (
      value: T
    ) =>
      | Result<U, E | F>
      | AsyncResult<U, E | F>
      | Promise<Result<U, E | F>>
      | Promise<AsyncResult<U, E | F>>
  ): AsyncResult<U, E | F>

  /**
   * Applies `fn` to the result, returning whatever `fn` returns.
   */
  mapResult<U>(fn: (result: this) => U): U

  /**
   * Applies `fn` to the result, returning the same result.
   */
  tap(fn: (result: this) => void): this

  /**
   * Returns a contained `Ok` value, or throws a contained `Err` error.
   *
   * @example
   *
   *   console.log(ok(1).unwrap()) // logs `1`
   *   console.log(err(NaN).unwrap()) // throws `NaN`
   */
  unwrap(): Promise<T>

  /**
   * Returns a contained `Err` error, or throws a contained `Ok` value.
   *
   * @example
   *
   *   console.log(ok(1).unwrapErr()) // throws `1`
   *   console.log(err(NaN).unwrapErr()) // logs `NaN`
   */
  unwrapErr(): Promise<E>

  /**
   * Returns a contained `Ok` value, or throws `throwable`.
   *
   * @example
   *
   *   console.log(ok(1).expect('expected a number')) // logs `1`
   *   console.log(err(NaN).expect('expected a number')) // throws 'expected a number'
   */
  expect(throwable: unknown): Promise<T>

  /**
   * Returns a contained `Err` error, or throws `throwable`.
   *
   * @example
   *
   *   console.log(ok(1).expectErr('expected an error')) // throws 'expected an error'
   *   console.log(err(NaN).expectErr('expected an error')) // logs `NaN`
   */
  expectErr(throwable: unknown): Promise<E>
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
   * Applies `fn` to the contained error and returns the result.
   */
  mapErr(fn: (error: never) => unknown): Ok<T>

  /**
   * Applies `fn` to the contained value and returns the result.
   */
  mapOr<U>(defaultValue: U, fn: (value: T) => U): U

  /**
   * Applies `fn` to the contained value and returns the result.
   */
  mapOrElse<U>(defaultFn: (error: never) => U, fn: (value: T) => U): U

  /**
   * Applies `fn` to a contained `Ok` value for a new `Result`.
   */
  andThen<U>(fn: (value: T) => Result<U, never>): Ok<U>

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
   * Applies `fn` to the contained error and wraps it in `Err`.
   */
  mapErr<F>(fn: (error: E) => F): Err<F>

  /**
   * Returns `defaultValue`.
   */
  mapOr<U>(defaultValue: U, fn: (value: never) => U): U

  /**
   * Calls `defaultFn` and returns the result.
   */
  mapOrElse<U>(defaultFn: (error: E) => U, fn: (value: never) => U): U

  /**
   * Returns `Err` as-is.
   */
  andThen<U, F>(fn: (value: never) => Result<U, F>): Err<E>

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

class ResultImpl<T, E> implements Result<T, E> {
  private readonly _isOk: boolean
  private readonly _value?: T
  private readonly _error?: E

  public constructor(isOk: true, value: T)
  public constructor(isOk: false, error: E)
  public constructor(isOk: boolean, valueOrError: T | E) {
    this._isOk = isOk
    if (isOk) {
      this._value = valueOrError as T
    } else {
      this._error = valueOrError as E
    }
  }

  /**
   * Returns `this`.
   */
  public toResult(): this {
    return this
  }

  /**
   * Returns a wrapper for this `Result` to prepare for async operations.
   */
  public async(): AsyncResult<T, E> {
    return asyncResult(this)
  }

  /**
   * Returns `true` if the result is `Ok`.
   */
  public isOk(): this is Ok<T> {
    return this._isOk
  }

  /**
   * Returns `true` if the result is `Err`.
   */
  public isErr(): this is Err<E> {
    return !this._isOk
  }

  /**
   * Returns the value if result is `Ok`, otherwise undefined.
   */
  public ok(): Optional<T> {
    return this._value
  }

  /**
   * Returns the error if result is `Err`, otherwise undefined.
   */
  public err(): Optional<E> {
    return this._error
  }

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
  public map<U>(fn: (value: T) => U): Result<U, E> {
    return this.isOk() ? ok(fn(this.unwrap())) : err(this.unwrapErr())
  }

  /**
   * Maps a `Result<T, E>` to `Result<T, F>` by applying `fn` to an `Err` value,
   * leaving an `Ok` value untouched.
   *
   * @example
   *
   *   const times2 = (n: number) => n * 2
   *   console.log(ok(1).mapErr(times2).ok()) // logs `1`
   *   console.log(err(-1).mapErr(times2).err()) // logs `-2`
   */
  public mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return this.isOk() ? ok(this.unwrap()) : err(fn(this.unwrapErr()))
  }

  /**
   * Applies `fn` to a contained `Ok` value or returns `defaultValue` for `Err`.
   *
   * @example
   *
   *   const times2 = (n: number) => n * 2
   *   console.log(ok(1).mapOr(-1, times2)) // logs `2`
   *   console.log(err(NaN).mapOr(-1, times2)) // logs `-1`
   */
  public mapOr<U>(defaultValue: U, fn: (value: T) => U): U {
    return this.isOk() ? fn(this.unwrap()) : defaultValue
  }

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
  public mapOrElse<U>(defaultFn: (error: E) => U, fn: (value: T) => U): U {
    return this.isOk() ? fn(this.unwrap()) : defaultFn(this.unwrapErr())
  }

  /**
   * Applies `fn` to a contained `Ok` value for a new `Result`, or returns `Err`
   * as-is.
   */
  public andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E>
  public andThen<U, F>(fn: (value: T) => Result<U, F>): Result<U, E | F>
  public andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return this.isOk() ? fn(this.unwrap()) : err(this.unwrapErr())
  }

  /**
   * Applies `fn` to the result, returning whatever `fn` returns.
   */
  public mapResult<U>(fn: (result: this) => U): U {
    return fn(this)
  }

  /**
   * Applies `fn` to the result, returning the same result.
   */
  public tap(fn: (result: this) => void): this {
    fn(this)
    return this
  }

  /**
   * Returns a contained `Ok` value, or throws a contained `Err` error.
   *
   * @example
   *
   *   console.log(ok(1).unwrap()) // logs `1`
   *   console.log(err(NaN).unwrap()) // throws `NaN`
   */
  public unwrap(): T {
    if (this.isErr()) {
      throw this.err()
    }
    return this._value as T
  }

  /**
   * Returns a contained `Err` error, or throws a contained `Ok` value.
   *
   * @example
   *
   *   console.log(ok(1).unwrapErr()) // throws `1`
   *   console.log(err(NaN).unwrapErr()) // logs `NaN`
   */
  public unwrapErr(): E {
    if (this.isOk()) {
      throw this.ok()
    }
    return this._error as E
  }

  /**
   * Returns a contained `Ok` value, or throws `throwable`.
   *
   * @example
   *
   *   console.log(ok(1).expect('expected a number')) // logs `1`
   *   console.log(err(NaN).expect('expected a number')) // throws 'expected a number'
   */
  public expect(throwable: unknown): T {
    if (this.isErr()) {
      throw throwable
    }
    return this._value as T
  }

  /**
   * Returns a contained `Err` error, or throws `throwable`.
   *
   * @example
   *
   *   console.log(ok(1).expectErr('expected an error')) // throws 'expected an error'
   *   console.log(err(NaN).expectErr('expected an error')) // logs `NaN`
   */
  public expectErr(throwable: unknown): E {
    if (this.isOk()) {
      throw throwable
    }
    return this._error as E
  }
}

/**
 * Wraps a `Result` and provides an async-aware API for working with it.
 */
class AsyncResultImpl<T, E> implements AsyncResult<T, E> {
  private readonly _result: Promise<Result<T, E>>

  public constructor(result: Promise<Result<T, E>>) {
    this._result = result
  }

  /**
   * Resolves to the wrapped `Result`.
   */
  public toResult(): Promise<Result<T, E>> {
    return this._result
  }

  /**
   * Returns `this`.
   */
  public async(): this {
    return this
  }

  /**
   * Resolves to `true` if the wrapped `Result` is `Ok`.
   */
  public async isOk(): Promise<boolean> {
    return (await this._result).isOk()
  }

  /**
   * Resolves to `true` if the wrapped `Result` is `Err`.
   */
  public async isErr(): Promise<boolean> {
    return (await this._result).isErr()
  }

  /**
   * Resolves to the wrapped value if result is `Ok`, otherwise undefined.
   */
  public async ok(): Promise<Optional<T>> {
    return (await this._result).ok()
  }

  /**
   * Resolves to the wrapped error if result is `Err`, otherwise undefined.
   */
  public async err(): Promise<Optional<E>> {
    return (await this._result).err()
  }

  /**
   * Maps the wrapped result by applying `fn` to an `Ok` value, leaving an `Err`
   * value untouched.
   *
   * @example
   *
   *   const maybeUserInfo = await getUserInput('Enter an ID:')
   *     .map(fetchUserById)
   *     .ok()
   */
  public map<U>(fn: (value: T) => U | Promise<U>): AsyncResult<U, E> {
    return asyncResult(
      this._result.then(async (result) =>
        result.isOk() ? ok(await fn(result.unwrap())) : err(result.unwrapErr())
      )
    )
  }

  /**
   * Maps the wrapped error by applying `fn` to an `Err` value, leaving an `Ok`
   * value untouched.
   *
   * @example
   *
   *   await readFile('file.txt')
   *     .mapErr(describeError)
   *     .mapOrElse(
   *       (error) => console.error('reading file failed:', error),
   *       (contents) => console.log('file contents:', contents)
   *     )
   */
  public mapErr<F>(fn: (error: E) => F | Promise<F>): AsyncResult<T, F> {
    return asyncResult(
      this._result.then(async (result) =>
        result.isOk() ? ok(result.unwrap()) : err(await fn(result.unwrapErr()))
      )
    )
  }

  /**
   * Maps the wrapped value if result is `Ok`, or resolves to `defaultValue`.
   *
   * @example
   *
   *   const size = await stat('file.txt').mapOr(
   *     -1,
   *     (stat) => stat.size
   *   )
   */
  public async mapOr<U>(
    defaultValue: U | Promise<U>,
    fn: (value: T) => U | Promise<U>
  ): Promise<U> {
    return (await this.isOk()) ? fn(await this.unwrap()) : defaultValue
  }

  /**
   * Maps both the wrapped value and error as appropriate:
   *
   * @example
   *
   *   await open('file.txt').mapOrElse(
   *     (error) => makePlaceholderFile('file.txt'),
   *     (file) => wrapFile(file)
   *   )
   */
  public async mapOrElse<U>(
    defaultFn: (error: E) => U | Promise<U>,
    fn: (value: T) => U | Promise<U>
  ): Promise<U> {
    return (await this.isOk())
      ? fn(await this.unwrap())
      : defaultFn(await this.unwrapErr())
  }

  /**
   * Applies `fn` to a contained `Ok` value. Useful for setting up a chain of
   * actions to be completed.
   *
   * @example
   *
   *   const maybeAnalysis = await open('file.txt')
   *     .andThen((file) => file.read(1024))
   *     .andThen((head) => analyze(head))
   *     .ok()
   */
  public andThen<U, F>(
    fn: (
      value: T
    ) =>
      | Result<U, E | F>
      | AsyncResult<U, E | F>
      | Promise<Result<U, E | F> | AsyncResult<U, E | F>>
  ): AsyncResult<U, E | F> {
    return asyncResult(
      this._result
        .then(
          async (result): Promise<Result<U, E | F> | AsyncResult<U, E | F>> =>
            result.isOk() ? fn(result.unwrap()) : err<U, E>(result.unwrapErr())
        )
        .then((result) => result.toResult())
    )
  }

  /**
   * Applies `fn` to the result, returning whatever `fn` returns.
   */
  public mapResult<U>(fn: (result: this) => U): U {
    return fn(this)
  }

  /**
   * Applies `fn` to the result, returning the same result. Useful for logging
   * or debugging.
   */
  public tap(fn: (result: this) => void): this {
    fn(this)
    return this
  }

  /**
   * Resolves to the contained value or rejects with the error.
   */
  public async unwrap(): Promise<T> {
    return (await this._result).unwrap()
  }

  /**
   * Resolves to the contained error or rejects with the value.
   */
  public async unwrapErr(): Promise<E> {
    return (await this._result).unwrapErr()
  }

  /**
   * Resolves to the contained value or rejects with `throwable`.
   */
  public async expect(throwable: unknown): Promise<T> {
    return (await this._result).expect(throwable)
  }

  /**
   * Resolves to the contained error or rejects with `throwable`.
   */
  public async expectErr(throwable: unknown): Promise<E> {
    return (await this._result).expectErr(throwable)
  }
}

/**
 * Returns an empty `Result`.
 */
export function ok<E>(): Result<void, E>

/**
 * Returns a `Result` containing `value`.
 */
export function ok<T, E>(value: T): Result<T, E>
export function ok<T, E>(value: T = (undefined as unknown) as T): Result<T, E> {
  return new ResultImpl(true, value)
}

/**
 * Returns a `Result` containing `error`.
 */
export function err<T, E>(error: E): Result<T, E> {
  return new ResultImpl(false, error)
}

/**
 * Returns an `AsyncResult` with wrapping the resolved `result`.
 */
export function asyncResult<T, E = Error>(
  result: Result<T, E> | Promise<Result<T, E>>
): AsyncResult<T, E> {
  return new AsyncResultImpl(Promise.resolve(result))
}
