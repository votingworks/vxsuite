import { Tabulation } from '@votingworks/types';
import { getGroupKey } from './tabulation';

/**
 * Currently, if results are split by batch and scanner then they are opportunistic,
 * only including non-zero splits.
 */
export function groupBySupportsZeroSplits(
  groupBy: Tabulation.GroupBy
): boolean {
  if (groupBy.groupByBatch || groupBy.groupByScanner) {
    return false;
  }

  return true;
}

/**
 * Given a list of opportunistic splits (i.e. only non-zero splits), a list of
 * all possible splits, and a function to create an empty split, returns a fully
 * populated list of all expected splits. Important for interpolating empty splits
 * into reports and exports. Order of expected splits is preserved.
 */
export function populateSplits<T>({
  expectedSplits,
  nonEmptySplits,
  groupBy,
  makeEmptySplit,
}: {
  expectedSplits: Tabulation.GroupSpecifier[];
  nonEmptySplits: Tabulation.GroupMap<T>;
  groupBy: Tabulation.GroupBy;
  makeEmptySplit: () => T;
}): T[] {
  const allSplits: T[] = [];

  for (const expectedSplit of expectedSplits) {
    const nonEmptySplit = nonEmptySplits[getGroupKey(expectedSplit, groupBy)];

    if (nonEmptySplit) {
      allSplits.push({
        // eslint-disable-next-line vx/gts-spread-like-types
        ...nonEmptySplit,
        ...expectedSplit,
      });
    } else {
      allSplits.push({
        // eslint-disable-next-line vx/gts-spread-like-types
        ...makeEmptySplit(),
        ...expectedSplit,
      });
    }
  }

  return allSplits;
}
