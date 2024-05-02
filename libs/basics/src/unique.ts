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
