/**
 * Returns an array with duplicate values removed.
 */
export function unique<T>(array: readonly T[]): T[] {
  return Array.from(new Set(array));
}
