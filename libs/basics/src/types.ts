/**
 * A type or a promise of a type.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Represents an optional value where `undefined` is used when missing.
 */
export type Optional<T> = T | undefined;
