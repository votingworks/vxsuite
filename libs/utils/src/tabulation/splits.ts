import { Optional } from '@votingworks/basics';
import {
  BallotStyle,
  ElectionDefinition,
  Precinct,
  Tabulation,
} from '@votingworks/types';
import {
  getBallotStyleIdsForFundamentalFilter,
  getBallotStyleIdsForFundamentalSplit,
  intersectSets,
} from './contest_filtering';
import {
  getGroupKey,
  getTrivialFundamentalGroupSpecifier,
  resolveGroupByToFundamentalGroupBy,
} from './parameters';
import { getBallotStylesByPrecinctId } from './lookups';

/**
 * Returns a set of splits (represented as {@link Tabulation.GroupSpecifier}s)
 * that is the simple cartesian product of the provided two lists of splits.
 * For example, with arguments:
 *
 *      x = [Ballot Style 1, Ballot Style 2]
 *      y = [Absentee, Precinct]
 *      result = [
 *       Absentee Ballot Style 1,
 *       Precinct Ballot Style 1,
 *       Absentee Ballot Style 2,
 *       Precinct Ballot Style 2,
 *    ]
 *
 * If the two lists have splits with shared properties, the first list will have
 * precedence, but this usage is highly discouraged.
 */
function cartesianProductSplits(
  x: Tabulation.FundamentalGroupSpecifier[],
  y: Tabulation.FundamentalGroupSpecifier[]
): Tabulation.FundamentalGroupSpecifier[] {
  const products: Tabulation.FundamentalGroupSpecifier[] = [];
  for (const xItem of x) {
    for (const yItem of y) {
      products.push({
        isFundamental: true,
        precinctId: xItem.precinctId || yItem.precinctId,
        ballotStyleId: xItem.ballotStyleId || yItem.ballotStyleId,
        votingMethod: xItem.votingMethod || yItem.votingMethod,
        batchId: xItem.batchId || yItem.batchId,
      });
    }
  }
  return products;
}

function getSplitsForPrecincts(
  precincts: Precinct[]
): Tabulation.FundamentalGroupSpecifier[] {
  const splits: Tabulation.FundamentalGroupSpecifier[] = [];
  for (const precinct of precincts) {
    splits.push({
      isFundamental: true,
      precinctId: precinct.id,
    });
  }
  return splits;
}

function getSplitsForBallotStyles(
  ballotStyles: BallotStyle[]
): Tabulation.FundamentalGroupSpecifier[] {
  const splits: Tabulation.FundamentalGroupSpecifier[] = [];
  for (const ballotStyle of ballotStyles) {
    splits.push({
      isFundamental: true,
      ballotStyleId: ballotStyle.id,
    });
  }
  return splits;
}

// currently hardcoded to only "Absentee" and "Precinct"
function getVotingMethodSplits(): Tabulation.FundamentalGroupSpecifier[] {
  const included: Tabulation.VotingMethod[] = ['absentee', 'precinct'];
  return included.map((votingMethod) => ({
    isFundamental: true,
    votingMethod,
  }));
}

export function getAllPossibleFundamentalSplits({
  groupBy,
  electionDefinition,
}: {
  groupBy: Tabulation.FundamentalGroupBy;
  electionDefinition: ElectionDefinition;
}): Optional<Tabulation.FundamentalGroupSpecifier[]> {
  // TODO: support generating all possible splits for batches. Requires
  // https://github.com/votingworks/vxsuite/issues/3801
  if (groupBy.groupByBatch) {
    return undefined;
  }

  let splits: Tabulation.FundamentalGroupSpecifier[] = [
    getTrivialFundamentalGroupSpecifier(),
  ];

  if (groupBy.groupByPrecinct) {
    splits = cartesianProductSplits(
      getSplitsForPrecincts([...electionDefinition.election.precincts]),
      [getTrivialFundamentalGroupSpecifier()]
    );
  }

  if (groupBy.groupByBallotStyle) {
    const splitsCutByBallotStyle: Tabulation.FundamentalGroupSpecifier[] = [];
    for (const split of splits) {
      const ballotStyles = split.precinctId
        ? getBallotStylesByPrecinctId(electionDefinition, split.precinctId)
        : electionDefinition.election.ballotStyles;
      splitsCutByBallotStyle.push(
        ...cartesianProductSplits(
          [split],
          getSplitsForBallotStyles([...ballotStyles])
        )
      );
    }
    splits = splitsCutByBallotStyle;
  }

  if (groupBy.groupByVotingMethod) {
    splits = cartesianProductSplits(splits, getVotingMethodSplits());
  }

  return splits;
}

export function filterFundamentalSplits(
  electionDefinition: ElectionDefinition,
  splits: Tabulation.FundamentalGroupSpecifier[],
  filter?: Tabulation.FundamentalFilter
): Tabulation.FundamentalGroupSpecifier[] {
  if (!filter) return splits;

  const filteredSplits: Tabulation.FundamentalGroupSpecifier[] = [];
  const filterBallotStyleIds = getBallotStyleIdsForFundamentalFilter(
    electionDefinition,
    filter
  );
  for (const split of splits) {
    // excluding splits based on precinct
    if (
      split.precinctId &&
      filter.precinctIds &&
      !filter.precinctIds.includes(split.precinctId)
    ) {
      continue;
    }

    // excluding splits based on ballot style, which is determined by combining
    // explicit ballot style and precinct attributes
    const splitBallotStyleIds = getBallotStyleIdsForFundamentalSplit(
      electionDefinition,
      split
    );
    const ballotStyleOverlap = intersectSets([
      filterBallotStyleIds,
      splitBallotStyleIds,
    ]);
    if (ballotStyleOverlap.size === 0) continue;

    // excluding splits based on voting method
    if (
      split.votingMethod &&
      filter.votingMethods &&
      !filter.votingMethods.includes(split.votingMethod)
    ) {
      continue;
    }

    // TODO: filter by batch once we support generating all possible splits for batches

    filteredSplits.push(split);
  }
  return filteredSplits;
}

/**
 * Currently, if results are split by batch and scanner then they are opportunistic,
 * only including non-zero splits.
 */
export function groupBySupportsZeroSplits(
  groupBy: Tabulation.GroupBy
): boolean {
  return !resolveGroupByToFundamentalGroupBy(groupBy).groupByBatch;
}

/**
 * Given a list of opportunistic splits (i.e. only non-zero splits), a list of
 * all possible splits, and a function to create an empty split, returns a fully
 * populated list of all expected splits. Important for interpolating empty splits
 * into reports and exports. Order of expected splits is preserved.
 */
export function populateFundamentalSplits<T>({
  nonEmptySplits,
  expectedSplits,
  groupBy,
  makeEmptySplit,
}: {
  nonEmptySplits: Tabulation.FundamentalGroupMap<T>;
  expectedSplits: Tabulation.FundamentalGroupSpecifier[];
  groupBy: Tabulation.FundamentalGroupBy;
  makeEmptySplit: () => T;
}): Tabulation.FundamentalGroupMap<T> {
  const populatedSplits: Tabulation.FundamentalGroupMap<T> = {};

  for (const expectedSplit of expectedSplits) {
    const groupKey = getGroupKey(expectedSplit, groupBy);
    populatedSplits[groupKey] = nonEmptySplits[groupKey] || makeEmptySplit();
  }

  return populatedSplits;
}
