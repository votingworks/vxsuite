import { Optional, assertDefined, throwTruthyValue } from '@votingworks/basics';
import { Election, ElectionDefinition, Tabulation } from '@votingworks/types';
import {
  getBallotStyleIdsForFilter,
  getBallotStyleIdsForSplit,
  intersectSets,
} from './contest_filtering';
import { getGroupKey } from './tabulation';

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
  x: Tabulation.GroupSpecifier[],
  y: Tabulation.GroupSpecifier[]
): Tabulation.GroupSpecifier[] {
  const products: Tabulation.GroupSpecifier[] = [];
  for (const xItem of x) {
    for (const yItem of y) {
      products.push({
        precinctId: xItem.precinctId || yItem.precinctId,
        partyId: xItem.partyId || yItem.partyId,
        ballotStyleId: xItem.ballotStyleId || yItem.ballotStyleId,
        votingMethod: xItem.votingMethod || yItem.votingMethod,
        batchId: xItem.batchId || yItem.batchId,
        scannerId: xItem.scannerId || yItem.scannerId,
      });
    }
  }
  return products;
}

/**
 * In other words, no splits. The cartesian product of any list of splits with
 * the trivial split is the original list of splits.
 */
const TRIVIAL_SPLIT: Tabulation.GroupSpecifier = {};

function getAllPrecinctSplits(election: Election): Tabulation.GroupSpecifier[] {
  const { precincts } = election;
  const splits: Tabulation.GroupSpecifier[] = [];
  for (const precinct of precincts) {
    splits.push({
      precinctId: precinct.id,
    });
  }
  return splits;
}

/**
 * Return the list of party splits, one for each party with associated ballot
 * styles. If no associated ballot styles, assume it's a general and return
 * the trivial split.
 */
function getAllPartySplits(election: Election): Tabulation.GroupSpecifier[] {
  const { ballotStyles } = election;
  let isPrimary = false;
  const partyIds = new Set<string>();
  for (const ballotStyle of ballotStyles) {
    if (ballotStyle.partyId) {
      isPrimary = true;
      partyIds.add(ballotStyle.partyId);
    }
  }

  if (!isPrimary) {
    return [TRIVIAL_SPLIT];
  }

  return [...partyIds].map((partyId) => ({ partyId }));
}

function getAllBallotStyleSplits(
  election: Election,
  includePartySpecifier?: boolean
): Tabulation.GroupSpecifier[] {
  const { ballotStyles } = election;
  const splits: Tabulation.GroupSpecifier[] = [];
  for (const ballotStyle of ballotStyles) {
    splits.push({
      ballotStyleId: ballotStyle.id,
      partyId: includePartySpecifier ? ballotStyle.partyId : undefined,
    });
  }
  return splits;
}

/**
 * Getting all splits on ballot style and precinct is not a simple cartesian
 * product because not all ballot styles are associated with all precincts.
 */
function getAllBallotStylePrecinctSplits(
  election: Election,
  includePartySpecifier?: boolean
): Tabulation.GroupSpecifier[] {
  const { ballotStyles } = election;
  const splits: Tabulation.GroupSpecifier[] = [];
  for (const ballotStyle of ballotStyles) {
    for (const precinctId of ballotStyle.precincts) {
      splits.push({
        ballotStyleId: ballotStyle.id,
        precinctId,
        partyId: includePartySpecifier ? ballotStyle.partyId : undefined,
      });
    }
  }

  // give precinct sort priority
  return [...splits].sort((x, y) =>
    assertDefined(x.precinctId).localeCompare(assertDefined(y.precinctId))
  );
}

// currently hardcoded to only "Absentee" and "Precinct"
function getVotingMethodSplits(): Tabulation.GroupSpecifier[] {
  return [
    {
      votingMethod: 'precinct',
    },
    {
      votingMethod: 'absentee',
    },
  ];
}

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
 * For a given group by clause, returns all possible splits based on election
 * definition.
 *
 * Default sort order for easily cleaner CSV exports and ballot reports:
 *   1. Precinct
 *   2. Party
 *   3. Ballot Style
 *   4. Voting Method
 *
 * We currently don't support mixing batch and scanner splits with other splits,
 * so we just return undefined if either of those are present.
 */
export function getAllPossibleSplits(
  electionDefinition: ElectionDefinition,
  groupBy: Tabulation.GroupBy
): Optional<Tabulation.GroupSpecifier[]> {
  if (!groupBySupportsZeroSplits(groupBy)) {
    return undefined;
  }

  const { election } = electionDefinition;
  let splits: Tabulation.GroupSpecifier[] = [TRIVIAL_SPLIT];

  // Precinct, Party, and Ballot Style splits are interrelated in such a way
  // that the cases must be handled individually. Relationships:
  //     Ballot Style <-> Party  -  each ballot style directly indicates the party (or lack thereof)
  //     Ballot Style <-> Precinct - each ballot style is limited to a subset of precincts
  //     Precinct <-> Party - no special relationship
  const { groupByPrecinct, groupByParty, groupByBallotStyle } = groupBy;
  switch (groupByBallotStyle) {
    case true:
      switch (groupByPrecinct) {
        case true:
          splits = getAllBallotStylePrecinctSplits(election, groupByParty);
          break;
        default:
          splits = getAllBallotStyleSplits(election, groupByParty);
      }
      break;
    default:
      switch (groupByPrecinct) {
        case true:
          switch (groupByParty) {
            case true:
              splits = cartesianProductSplits(
                getAllPrecinctSplits(election),
                getAllPartySplits(election)
              );
              break;
            default:
              splits = getAllPrecinctSplits(election);
          }
          break;
        default:
          switch (groupByParty) {
            case true:
              splits = getAllPartySplits(election);
              break;
            /* c8 ignore next 3 */
            default:
              throwTruthyValue(
                groupByPrecinct && groupByParty && groupByBallotStyle
              );
          }
      }
  }

  if (groupBy.groupByVotingMethod) {
    return cartesianProductSplits(splits, getVotingMethodSplits());
  }

  return splits;
}

export function filterSplits(
  electionDefinition: ElectionDefinition,
  splits: Tabulation.GroupSpecifier[],
  filter?: Tabulation.Filter
): Tabulation.GroupSpecifier[] {
  if (!filter) return splits;

  const filteredSplits: Tabulation.GroupSpecifier[] = [];
  const filterBallotStyleIds = getBallotStyleIdsForFilter(
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
    // explicit ballot style attributes, party attributes, and precinct attributes
    const splitBallotStyleIds = getBallotStyleIdsForSplit(
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

    // TODO: combine batch and scanner attributes into shared batch sets that
    // can be intersected, which would be more thorough than what we're doing here
    if (
      split.batchId &&
      filter.batchIds &&
      !filter.batchIds.includes(split.batchId)
    ) {
      continue;
    }
    if (
      split.scannerId &&
      filter.scannerIds &&
      !filter.scannerIds.includes(split.scannerId)
    ) {
      continue;
    }

    filteredSplits.push(split);
  }
  return filteredSplits;
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
