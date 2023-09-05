import { ElectionDefinition, Tabulation } from '@votingworks/types';
import { Optional, Result, err, ok } from '@votingworks/basics';
import { getPrecinctById } from '@votingworks/utils';

const VOTING_METHOD_LABELS: Record<Tabulation.VotingMethod, string> = {
  absentee: 'Absentee',
  precinct: 'Precinct',
  provisional: 'Provisional',
};

/**
 * Attempts to generate a title for the report based on it's filter.
 */
export function generateTitleForReport({
  filter,
  electionDefinition,
}: {
  filter: Tabulation.Filter;
  electionDefinition: ElectionDefinition;
}): Result<Optional<string>, 'title-not-supported'> {
  // If the report has any compound filters, we don't try to intelligently generate a title.
  if (
    (filter.partyIds && filter.partyIds.length > 1) ||
    (filter.ballotStyleIds && filter.ballotStyleIds.length > 1) ||
    (filter.precinctIds && filter.precinctIds.length > 1) ||
    (filter.batchIds && filter.batchIds.length > 1) ||
    (filter.scannerIds && filter.scannerIds.length > 1) ||
    (filter.votingMethods && filter.votingMethods.length > 1)
  ) {
    return err('title-not-supported');
  }

  const ballotStyleId = filter.ballotStyleIds?.[0];
  const precinctId = filter.precinctIds?.[0];
  const batchId = filter.batchIds?.[0];
  const scannerId = filter.scannerIds?.[0];
  const votingMethod = filter.votingMethods?.[0];
  const partyId = filter.partyIds?.[0];

  const reportRank =
    (ballotStyleId ? 1 : 0) +
    (precinctId ? 1 : 0) +
    (batchId ? 1 : 0) +
    (scannerId ? 1 : 0) +
    (votingMethod ? 1 : 0) +
    (partyId ? 1 : 0);

  // Full Election Tally Report
  if (reportRank === 0) {
    return ok(undefined);
  }

  if (reportRank === 1) {
    if (precinctId) {
      return ok(
        `${getPrecinctById(electionDefinition, precinctId).name} Tally Report`
      );
    }

    if (ballotStyleId) {
      return ok(`Ballot Style ${ballotStyleId} Tally Report`);
    }

    if (votingMethod) {
      return ok(`${VOTING_METHOD_LABELS[votingMethod]} Ballot Tally Report`);
    }
  }

  if (reportRank === 2) {
    if (precinctId && votingMethod) {
      return ok(
        `${getPrecinctById(electionDefinition, precinctId).name} ${
          VOTING_METHOD_LABELS[votingMethod]
        } Ballot Tally Report`
      );
    }

    if (ballotStyleId && votingMethod) {
      return ok(
        `Ballot Style ${ballotStyleId} ${VOTING_METHOD_LABELS[votingMethod]} Ballot Tally Report`
      );
    }

    if (precinctId && ballotStyleId) {
      return ok(
        `Ballot Style ${ballotStyleId} ${
          getPrecinctById(electionDefinition, precinctId).name
        } Tally Report`
      );
    }
  }

  return err('title-not-supported');
}

/**
 * Canonicalize a user-provided filter to a canonical filter to prevent unnecessary changes
 * to the rendered report and reload from cache more often.
 * - ignores empty filters
 * - sorts filter values alphabetically
 */
export function canonicalizeFilter(
  filter: Tabulation.Filter
): Tabulation.Filter {
  return {
    ballotStyleIds:
      filter.ballotStyleIds && filter.ballotStyleIds.length > 0
        ? [...filter.ballotStyleIds].sort()
        : undefined,
    partyIds:
      filter.partyIds && filter.partyIds.length > 0
        ? [...filter.partyIds].sort()
        : undefined,
    precinctIds:
      filter.precinctIds && filter.precinctIds.length > 0
        ? [...filter.precinctIds].sort()
        : undefined,
    scannerIds:
      filter.scannerIds && filter.scannerIds.length > 0
        ? [...filter.scannerIds].sort()
        : undefined,
    batchIds:
      filter.batchIds && filter.batchIds.length > 0
        ? [...filter.batchIds].sort()
        : undefined,
    votingMethods:
      filter.votingMethods && filter.votingMethods.length > 0
        ? [...filter.votingMethods].sort()
        : undefined,
  };
}

export function canonicalizeGroupBy(
  groupBy: Tabulation.GroupBy
): Tabulation.GroupBy {
  return {
    groupByBallotStyle: groupBy.groupByBallotStyle ?? false,
    groupByParty: groupBy.groupByParty ?? false,
    groupByPrecinct: groupBy.groupByPrecinct ?? false,
    groupByScanner: groupBy.groupByScanner ?? false,
    groupByVotingMethod: groupBy.groupByVotingMethod ?? false,
    groupByBatch: groupBy.groupByBatch ?? false,
  };
}
