/**
 * Maps values from a `Map` to another `Map`, preserving the original keys.
 */
export function map<K, V, U>(
  collection: ReadonlyMap<K, V>,
  fn: (value: V, key: K) => U
): Map<K, U>;

/**
 * Maps values from a `Set` to another `Set`.
 */
export function map<T, U>(
  collection: ReadonlySet<T>,
  fn: (value: T) => U
): Set<U>;

/**
 * Maps values from an array to another array.
 */
export function map<T, U>(
  collection: readonly T[],
  fn: (value: T, index: number) => U
): U[];

/**
 * Maps values from a map, set, or array to another map, set, or array.
 */
export function map<T, U>(
  collection: ReadonlyMap<unknown, T> | ReadonlySet<T> | readonly T[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (value: T, key: any) => U
): Map<unknown, U> | Set<U> | U[] {
  if (collection instanceof Map) {
    return new Map(
      Array.from(collection, ([key, value]) => [key, fn(value, key)])
    );
  }

  if (collection instanceof Set) {
    return new Set(Array.from(collection, (value) => fn(value, value)));
  }

  if (Array.isArray(collection)) {
    return collection.map((value, index) => fn(value, index));
  }

  throw new Error('Unsupported collection type');
}

/**
 * Reduces values from a `Map` to a single value.
 */
export function reduce<K, V, U>(
  collection: ReadonlyMap<K, V>,
  fn: (acc: U, value: V, key: K) => U,
  initial: U
): U;

/**
 * Reduces values from a `Set` to a single value.
 */
export function reduce<T, U>(
  collection: ReadonlySet<T>,
  fn: (acc: U, value: T) => U,
  initial: U
): U;

/**
 * Reduces values from an array to a single value.
 */
export function reduce<T, U>(
  collection: readonly T[],
  fn: (acc: U, value: T, index: number) => U,
  initial: U
): U;

/**
 * Reduces values from a map, set, or array to a single value.
 */
export function reduce<T, U>(
  collection: ReadonlyMap<unknown, T> | ReadonlySet<T> | readonly T[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (acc: U, value: T, key: any) => U,
  initial: U
): U {
  if (collection instanceof Map) {
    return Array.from(collection).reduce(
      (acc, [key, value]) => fn(acc, value, key),
      initial
    );
  }

  if (collection instanceof Set) {
    return Array.from(collection).reduce(
      (acc, value) => fn(acc, value, value),
      initial
    );
  }

  if (Array.isArray(collection)) {
    return collection.reduce(fn, initial);
  }

  throw new Error('Unsupported collection type');
}
