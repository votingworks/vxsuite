import type { Precinct, PrecinctWithSplits } from '@votingworks/design-backend';

export function hasSplits(precinct: Precinct): precinct is PrecinctWithSplits {
  return 'splits' in precinct && precinct.splits !== undefined;
}

/**
 * Given a prefix and a list of existing IDs, returns the next ID of the format
 * `${prefix}${n}` that does not already exist. Increments `n` starting at 1.
 */
export function nextId(prefix: string, existingIds?: Iterable<string>): string {
  let n = 1;
  const existingIdsSet = new Set(existingIds);
  while (existingIdsSet.has(`${prefix}${n}`)) {
    n += 1;
  }
  return `${prefix}${n}`;
}

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
