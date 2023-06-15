import { Tabulation } from '@votingworks/types';
import { getEmptyCardCounts } from '@votingworks/utils';
import { ApiMock } from './api_mock';

/**
 * To match backend input exactly, per `MockFunction` requirements, mock out
 * false values instead of undefined.
 */
export function mockBallotCountsTableGroupBy(
  groupBy: Tabulation.GroupBy
): Tabulation.GroupBy {
  return {
    groupByBatch: false,
    groupByParty: false,
    groupByPrecinct: false,
    groupByScanner: false,
    groupByVotingMethod: false,
    ...groupBy,
  };
}

/**
 * The reports screen fires off a number of queries of the same type, but they are
 * always ordered the same way. This helper function mocks out the expected queries.
 *
 * This is a temporary solution until we redesign the reports screen to remove the
 * excessive ballot counts (e.g. precinct, scanner, and batch do not make sense).
 */
export function expectReportsScreenCardCountQueries({
  apiMock,
  isPrimary,
  overallCardCount = getEmptyCardCounts(),
}: {
  apiMock: ApiMock;
  isPrimary: boolean;
  overallCardCount?: Tabulation.CardCounts;
}): void {
  apiMock.expectGetCardCounts(
    mockBallotCountsTableGroupBy({ groupByPrecinct: true }),
    []
  );
  apiMock.expectGetCardCounts(
    mockBallotCountsTableGroupBy({ groupByVotingMethod: true }),
    []
  );
  if (isPrimary) {
    apiMock.expectGetCardCounts(
      mockBallotCountsTableGroupBy({ groupByParty: true }),
      []
    );
  }
  apiMock.expectGetCardCounts(
    mockBallotCountsTableGroupBy({ groupByScanner: true }),
    []
  );
  apiMock.expectGetCardCounts({}, [overallCardCount]);
}
