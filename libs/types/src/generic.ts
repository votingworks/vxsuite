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
export type Result<T, E> = Ok<T> | Err<E>

export interface Ok<T> {
  /**
   * Returns `true`.
   */
  isOk(): this is Ok<T>

  /**
   * Returns `false`.
   */
  isErr(): this is Err<never>

  /**
   * Returns the contained value.
   */
  ok(): T

  /**
   * Returns `undefined`.
   */
  err(): undefined

  /**
   * Returns the contained value.
   */
  unwrap(): T

  /**
   * Throws the contained value.
   */
  unwrapErr(): never
}

export interface Err<E> {
  /**
   * Returns `false`.
   */
  isOk(): this is Ok<never>

  /**
   * Returns `true`.
   */
  isErr(): this is Err<E>

  /**
   * Returns `undefined`.
   */
  ok(): undefined

  /**
   * Returns the contained error.
   */
  err(): E

  /**
   * Throws the contained error.
   */
  unwrap(): never

  /**
   * Returns the contained error.
   */
  unwrapErr(): E
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
  return {
    isErr: () => false,
    isOk: () => true,
    err: () => undefined,
    ok: () => value,
    unwrap: () => value,
    unwrapErr: () => {
      throw value
    },
  }
}

/**
 * Returns a `Result` containing `error`.
 */
export function err<T, E>(error: E): Result<T, E> {
  return {
    isErr: () => true,
    isOk: () => false,
    err: () => error,
    ok: () => undefined,
    unwrap: () => {
      throw error
    },
    unwrapErr: () => error,
  }
}
