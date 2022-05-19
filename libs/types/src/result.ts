/* eslint-disable max-classes-per-file */
import { inspect, InspectOptions } from 'util';

/**
 * Represents a successful result of type `T`.
 */
class Ok<T> {
  constructor(private readonly value: T) {}

  /**
   * Returns `true`.
   */
  isOk(): this is Ok<T> {
    return true;
  }

  /**
   * Returns `false`.
   */
  isErr(): this is Err<never> {
    return false;
  }

  /**
   * Returns the contained value.
   */
  ok(): T {
    return this.value;
  }

  /**
   * Returns `undefined`.
   */
  err(): undefined {
    return undefined;
  }

  /**
   * Returns the contained value.
   */
  unsafeUnwrap(): T {
    return this.value;
  }

  /**
   * Throws the contained value.
   */
  unsafeUnwrapErr(): never {
    throw this.value;
  }

  /**
   * Provides a custom inspect function for `Ok` values so that `console.log`
   * and the node REPL will pretty-print the wrapper and value.
   */
  private [inspect.custom](depth: number, options: InspectOptions) {
    if (depth < 0) {
      return 'ok(…)';
    }

    return `ok(${inspect(
      this.value,
      options.showHidden,
      depth - 1,
      options.colors
    )})`;
  }
}

/**
 * Represents a failed result of type `E`.
 */
class Err<E> {
  constructor(private readonly error: E) {}

  /**
   * Returns `false`.
   */
  isOk(): this is Ok<never> {
    return false;
  }

  /**
   * Returns `true`.
   */
  isErr(): this is Err<E> {
    return true;
  }

  /**
   * Returns `undefined`.
   */
  ok(): undefined {
    return undefined;
  }

  /**
   * Returns the contained error.
   */
  err(): E {
    return this.error;
  }

  /**
   * Throws the contained error.
   */
  unsafeUnwrap(): never {
    throw this.error;
  }

  /**
   * Returns the contained error.
   */
  unsafeUnwrapErr(): E {
    return this.error;
  }

  /**
   * Provides a custom inspect function for `Err` values so that `console.log`
   * and the node REPL will pretty-print the wrapper and value.
   */
  private [inspect.custom](depth: number, options: InspectOptions) {
    if (depth < 0) {
      return 'err(…)';
    }

    return `err(${inspect(
      this.error,
      options.showHidden,
      depth - 1,
      options.colors
    )})`;
  }
}

/**
 * Returns an empty `Result`.
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics
export function ok<E>(): Result<void, E>;

/**
 * Returns a `Result` containing `value`.
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics
export function ok<T, E>(value: T): Result<T, E>;
// eslint-disable-next-line vx/gts-no-return-type-only-generics
export function ok<T, E>(value: T = undefined as unknown as T): Result<T, E> {
  return new Ok(value);
}

/**
 * Returns a `Result` containing `error`.
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics
export function err<T, E>(error: E): Result<T, E> {
  return new Err(error);
}
/**
 * Wraps a caught exception, which is required by TS to have type unknown, as an Error.
 */
// eslint-disable-next-line vx/gts-no-return-type-only-generics
export function wrapException<T>(error: unknown): Result<T, Error> {
  return err(error instanceof Error ? error : new Error(String(error)));
}

// Export just the interfaces, not the classes. This encourages the use of
// `ok` and `err` constructors instead of the class constructors.
type OkInterface<T> = Ok<T>;
type ErrInterface<T> = Err<T>;
export { OkInterface as Ok, ErrInterface as Err };

/**
 * Represents either success with a value `T` or failure with error `E`.
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Determines whether the given value is a `Result`, i.e. `Ok` or `Err`.
 */
export function isResult(value: unknown): value is Result<unknown, unknown> {
  return value instanceof Ok || value instanceof Err;
}
