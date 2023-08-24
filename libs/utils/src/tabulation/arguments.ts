import { Tabulation } from '@votingworks/types';

export function convertGroupSpecifierToFilter(
  group: Tabulation.GroupSpecifier
): Tabulation.Filter {
  return {
    ballotStyleIds: group.ballotStyleId ? [group.ballotStyleId] : undefined,
    partyIds: group.partyId ? [group.partyId] : undefined,
    precinctIds: group.precinctId ? [group.precinctId] : undefined,
    scannerIds: group.scannerId ? [group.scannerId] : undefined,
    batchIds: group.batchId ? [group.batchId] : undefined,
    votingMethods: group.votingMethod ? [group.votingMethod] : undefined,
  };
}

export function mergeFilters(
  filter1: Tabulation.Filter,
  filter2: Tabulation.Filter
): Tabulation.Filter {
  return {
    ballotStyleIds:
      filter1.ballotStyleIds || filter2.ballotStyleIds
        ? [...(filter1.ballotStyleIds || []), ...(filter2.ballotStyleIds || [])]
        : undefined,
    partyIds:
      filter1.partyIds || filter2.partyIds
        ? [...(filter1.partyIds || []), ...(filter2.partyIds || [])]
        : undefined,
    precinctIds:
      filter1.precinctIds || filter2.precinctIds
        ? [...(filter1.precinctIds || []), ...(filter2.precinctIds || [])]
        : undefined,
    scannerIds:
      filter1.scannerIds || filter2.scannerIds
        ? [...(filter1.scannerIds || []), ...(filter2.scannerIds || [])]
        : undefined,
    batchIds:
      filter1.batchIds || filter2.batchIds
        ? [...(filter1.batchIds || []), ...(filter2.batchIds || [])]
        : undefined,
    votingMethods:
      filter1.votingMethods || filter2.votingMethods
        ? [...(filter1.votingMethods || []), ...(filter2.votingMethods || [])]
        : undefined,
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
