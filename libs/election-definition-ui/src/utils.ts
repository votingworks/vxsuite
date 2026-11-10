/**
 * Returns a copy of the given array with the value at the specified index
 * replaced with the given value.
 */
export function replaceAtIndex<T>(
  array: readonly T[],
  index: number,
  newValue: T
): T[] {
  return array.map((value, i) => (i === index ? newValue : value));
}
