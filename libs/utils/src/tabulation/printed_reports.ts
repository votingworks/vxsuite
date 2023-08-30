import { ElectionDefinition, Tabulation } from '@votingworks/types';
import { Optional, Result, err, ok } from '@votingworks/basics';
import { getPrecinctById } from './lookups';

const VOTING_METHOD_LABELS: Record<Tabulation.VotingMethod, string> = {
  absentee: 'Absentee',
  precinct: 'Precinct',
  provisional: 'Provisional',
};

/**
 * Attempts to generate a title for the report based on it's filter.
 */
export function generateTitleForReport({
  reportFilter,
  electionDefinition,
}: {
  reportFilter: Tabulation.Filter;
  electionDefinition: ElectionDefinition;
}): Result<Optional<string>, 'title-not-supported'> {
  // If the report has any compound filters, we don't try to intelligently generate a title.
  if (
    (reportFilter.partyIds && reportFilter.partyIds.length > 2) ||
    (reportFilter.ballotStyleIds && reportFilter.ballotStyleIds.length > 2) ||
    (reportFilter.precinctIds && reportFilter.precinctIds.length > 2) ||
    (reportFilter.batchIds && reportFilter.batchIds.length > 2) ||
    (reportFilter.scannerIds && reportFilter.scannerIds.length > 2) ||
    (reportFilter.votingMethods && reportFilter.votingMethods.length > 2)
  ) {
    return err('title-not-supported');
  }

  const ballotStyleId = reportFilter.ballotStyleIds?.[0];
  const precinctId = reportFilter.precinctIds?.[0];
  const batchId = reportFilter.batchIds?.[0];
  const scannerId = reportFilter.scannerIds?.[0];
  const votingMethod = reportFilter.votingMethods?.[0];
  const partyId = reportFilter.partyIds?.[0];

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
        `Precinct Tally Report for ${
          getPrecinctById(electionDefinition, precinctId).name
        }`
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
        `${
          getPrecinctById(electionDefinition, precinctId).name
        } Ballot Style ${ballotStyleId} Tally Report`
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
export function canonicalizeCustomReportFilter(
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
