import check8601 from '@antongolub/iso8601';
import { z } from 'zod';

export interface Dictionary<T> {
  [key: string]: Optional<T>;
}
export type Optional<T> = T | undefined;
export interface Provider<T> {
  get(): Promise<T>;
}

/**
 * Represents either success with a value `T` or failure with error `E`.
 */
export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  /**
   * Returns `true`.
   */
  isOk(): this is Ok<T>;

  /**
   * Returns `false`.
   */
  isErr(): this is Err<never>;

  /**
   * Returns the contained value.
   */
  ok(): T;

  /**
   * Returns `undefined`.
   */
  err(): undefined;

  /**
   * Returns the contained value.
   */
  unsafeUnwrap(): T;

  /**
   * Throws the contained value.
   */
  unsafeUnwrapErr(): never;
}

export interface Err<E> {
  /**
   * Returns `false`.
   */
  isOk(): this is Ok<never>;

  /**
   * Returns `true`.
   */
  isErr(): this is Err<E>;

  /**
   * Returns `undefined`.
   */
  ok(): undefined;

  /**
   * Returns the contained error.
   */
  err(): E;

  /**
   * Throws the contained error.
   */
  unsafeUnwrap(): never;

  /**
   * Returns the contained error.
   */
  unsafeUnwrapErr(): E;
}

/**
 * Returns an empty `Result`.
 */
export function ok<E>(): Result<void, E>;

/**
 * Returns a `Result` containing `value`.
 */
export function ok<T, E>(value: T): Result<T, E>;
export function ok<T, E>(value: T = (undefined as unknown) as T): Result<T, E> {
  return {
    isErr: () => false,
    isOk: () => true,
    err: () => undefined,
    ok: () => value,
    unsafeUnwrap: () => value,
    unsafeUnwrapErr: () => {
      throw value;
    },
  };
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
    unsafeUnwrap: () => {
      throw error;
    },
    unsafeUnwrapErr: () => error,
  };
}

/**
 * Parse `value` using `parser`. Note that this takes an object that is already
 * supposed to be of type `T`, not a JSON string. For that, use `safeParseJSON`.
 *
 * @returns `Ok` when the parse succeeded, `Err` otherwise.
 */
export function safeParse<T>(
  parser: z.ZodType<T>,
  value: unknown
): Result<T, z.ZodError> {
  const result = parser.safeParse(value);

  if (!result.success) {
    return err(result.error);
  }

  return ok(result.data);
}

/**
 * Parse JSON without throwing an exception if it's malformed. On success the
 * result will be `Ok<unknown>` and you'll need to validate the result yourself.
 * Given malformed JSON, the result will be `Err<SyntaxError>`. Add a parser
 * argument to automatically validate the resulting value after deserializing
 * the JSON.
 */
export function safeParseJSON(text: string): Result<unknown, SyntaxError>;
/**
 * Parse JSON and then validate the result with `parser`.
 */
export function safeParseJSON<T>(
  text: string,
  parser: z.ZodType<T>
): Result<T, z.ZodError | SyntaxError>;
export function safeParseJSON<T>(
  text: string,
  parser?: z.ZodType<T>
): Result<T | unknown, z.ZodError | SyntaxError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return err(error as SyntaxError);
  }

  return parser ? safeParse(parser, parsed) : ok(parsed);
}

export const Id = z
  .string()
  .nonempty()
  .refine((id) => !id.startsWith('_'), 'IDs may not start with an underscore')
  .refine(
    (id) => /^[-_a-z\d]+$/i.test(id),
    'IDs may only contain letters, numbers, dashes, and underscores'
  );
export const WriteInId = z
  .string()
  .nonempty()
  .refine(
    (id) => id.startsWith('__write-in'),
    'Write-In IDs must start with __write-in'
  );
export const HexString: z.ZodSchema<string> = z
  .string()
  .nonempty()
  .refine(
    (hex) => /^[0-9a-f]*$/i.test(hex),
    'hex strings must contain only 0-9 and a-f'
  );
export const ISO8601Date = z
  .string()
  .refine(check8601, 'dates must be in ISO8601 format');
export const MachineId = z
  .string()
  .nonempty()
  .refine(
    (id) => /^[-A-Z\d]+$/.test(id),
    'Machine IDs may only contain numbers, uppercase letters, and dashes'
  );
