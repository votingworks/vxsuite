import { Admin } from '@votingworks/api';
import { ContestId } from '@votingworks/types';
import { assert, collections, groupBy } from '@votingworks/utils';

export function getWriteInCountsByContestAndCandidate(
  writeInSummaryData: Admin.WriteInSummaryEntry[],
  onlyOfficialCandidates = false
): Map<ContestId, Map<string, number>> {
  const writeInsByContestAndCandidate = collections.map(
    groupBy(writeInSummaryData, ({ contestId }) => contestId),
    (writeInSummary) => {
      return onlyOfficialCandidates
        ? groupBy(
            [...writeInSummary].filter(
              (s) => s.writeInAdjudication?.adjudicatedOptionId !== undefined
            ),
            (s) => {
              // we have already filtered for this
              assert(s.writeInAdjudication?.adjudicatedOptionId !== undefined);
              return s.writeInAdjudication.adjudicatedOptionId;
            }
          )
        : groupBy(
            [...writeInSummary].filter(
              (s) =>
                s.writeInAdjudication?.adjudicatedValue !== undefined &&
                s.writeInAdjudication?.adjudicatedOptionId === undefined
            ),
            (s) => {
              // we have already filtered for this
              assert(s.writeInAdjudication?.adjudicatedValue !== undefined);
              return s.writeInAdjudication.adjudicatedValue;
            }
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
