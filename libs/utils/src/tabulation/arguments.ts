import { BallotStyleGroupId, Tabulation } from '@votingworks/types';

export function combineGroupSpecifierAndFilter(
  group: Tabulation.GroupSpecifier,
  filter: Tabulation.Filter
): Tabulation.Filter {
  return {
    ...filter,
    ballotStyleGroupIds: (group.ballotStyleGroupId
      ? [group.ballotStyleGroupId]
      : filter.ballotStyleGroupIds) as BallotStyleGroupId[],
    partyIds: group.partyId ? [group.partyId] : filter.partyIds,
    precinctIds: group.precinctId ? [group.precinctId] : filter.precinctIds,
    scannerIds: group.scannerId ? [group.scannerId] : filter.scannerIds,
    batchIds: group.batchId ? [group.batchId] : filter.batchIds,
    votingMethods: group.votingMethod
      ? [group.votingMethod]
      : filter.votingMethods,
  };
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

export function isGroupByEmpty(groupBy: Tabulation.GroupBy): boolean {
  return !(
    groupBy.groupByBallotStyle ||
    groupBy.groupByBatch ||
    groupBy.groupByPrecinct ||
    groupBy.groupByParty ||
    groupBy.groupByScanner ||
    groupBy.groupByVotingMethod
  );
}

export function isFilterEmpty(filter: Tabulation.Filter): boolean {
  return !(
    filter.ballotStyleGroupIds ||
    filter.partyIds ||
    filter.precinctIds ||
    filter.scannerIds ||
    filter.batchIds ||
    filter.votingMethods
  );
}
