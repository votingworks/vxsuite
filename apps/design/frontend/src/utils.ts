import type { Precinct, PrecinctWithSplits } from '@votingworks/design-backend';

export function hasSplits(precinct: Precinct): precinct is PrecinctWithSplits {
  return 'splits' in precinct && precinct.splits !== undefined;
}

/**
 * Given a prefix and a list of existing IDs, returns the next ID of the format
 * `${prefix}${n}` that does not already exist. Increments `n` starting at 1.
 */
export function nextId(prefix: string, existingIds?: string[]): string {
  let n = 1;
  const existingIdsSet = new Set(existingIds);
  while (existingIdsSet.has(`${prefix}${n}`)) {
    n += 1;
  }
  return `${prefix}${n}`;
}
