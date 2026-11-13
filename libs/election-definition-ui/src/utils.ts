import { assert } from '@votingworks/basics';

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

/**
 * Returns a copy of the given array with the element at fromIndex
 * moved to toIndex.
 */
export function reorderElement<T>(
  array: readonly T[],
  fromIndex: number,
  toIndex: number
): T[] {
  assert(fromIndex >= 0 && fromIndex < array.length);
  assert(toIndex >= 0 && toIndex < array.length);
  const result = [...array];
  const [removed] = result.splice(fromIndex, 1);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  result.splice(toIndex, 0, removed!);
  return result;
}
