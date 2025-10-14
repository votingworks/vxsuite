import { deepEqual } from './equality';

/**
 * Returns an array with duplicate values removed.
 */
export function unique<T>(array: readonly T[]): T[] {
  return Array.from(new Set(array));
}

/**
 * Returns an array with duplicate values removed based on a key function.
 */
export function uniqueBy<T, U>(
  array: readonly T[],
  keyFn: (item: T) => U
): T[] {
  const seen = new Set<U>();
  const result: T[] = [];
  for (const item of array) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

/**
 * Returns an array with duplicate values removed, using deep equality to
 * determine uniqueness. If a key function is provided, it is used to
 * produce a value to compare instead of the item itself.
 */
export function uniqueDeep<T, U = T>(
  array: readonly T[],
  keyFn: (item: T) => U = (item) => item as unknown as U
): T[] {
  const result: Array<{ item: T; key: U }> = [];
  for (const item of array) {
    const key = keyFn(item);
    if (!result.some((existing) => deepEqual(existing.key, key))) {
      result.push({ item, key });
    }
  }
  return result.map(({ item }) => item);
}
