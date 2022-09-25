import { Admin } from '@votingworks/api';
import { ContestId, ContestOptionId } from '@votingworks/types';
import { collections, groupBy } from '@votingworks/utils';

export function getWriteInCountsByContestAndCandidate(
  writeInSummaryData: Admin.WriteInSummaryEntryAdjudicated[],
  onlyOfficialCandidates = false
): Map<ContestId, Map<string, number>> {
  const writeInsByContestAndCandidate = collections.map(
    groupBy(writeInSummaryData, ({ contestId }) => contestId),
    (writeInSummary) => {
      return onlyOfficialCandidates
        ? groupBy(
            [...writeInSummary].filter(
              (s) => s.writeInAdjudication.adjudicatedOptionId !== undefined
            ),
            (s) => s.writeInAdjudication.adjudicatedOptionId as ContestOptionId
          )
        : groupBy(
            [...writeInSummary].filter(
              (s) => s.writeInAdjudication.adjudicatedOptionId === undefined
            ),
            (s) => s.writeInAdjudication.adjudicatedValue
          );
    }
  );
  return collections.map(writeInsByContestAndCandidate, (byCandidate) =>
    collections.map(byCandidate, (entries) =>
      collections.reduce(
        entries,
        (sum, entry) => sum + entry.writeInCount ?? 0,
        0
      )
    )
  );
}
