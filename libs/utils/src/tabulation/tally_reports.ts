import {
  Candidate,
  CandidateContest,
  CandidateId,
  Tabulation,
} from '@votingworks/types';
import { assertDefined, iter } from '@votingworks/basics';
import { combineCandidateContestResults } from './tabulation';

type TallyReportCandidateRow = Candidate & {
  tally: number;
};

type SeparatedTallyReportCandidateRow = TallyReportCandidateRow & {
  manualTally: number;
};

function isNonCandidateWriteInTally(
  candidateTally: Tabulation.CandidateTally
): boolean {
  return (
    candidateTally.id === Tabulation.PENDING_WRITE_IN_ID ||
    candidateTally.id === Tabulation.GENERIC_WRITE_IN_ID
  );
}

function addWriteInLabelToName(
  candidateTally: Tabulation.CandidateTally
): Tabulation.CandidateTally {
  return {
    ...candidateTally,
    name: `${candidateTally.name} (Write-In)`,
  };
}

function getAllWriteInRows({
  combinedContestResults,
  contestResults,
  separateManualContestResults,
}: {
  combinedContestResults: Tabulation.CandidateContestResults;
  contestResults: Tabulation.CandidateContestResults;
  separateManualContestResults?: Tabulation.CandidateContestResults;
}): SeparatedTallyReportCandidateRow[] {
  const rows: SeparatedTallyReportCandidateRow[] = [];
  const writeInCandidateTallies: Tabulation.CandidateTally[] = [];
  const otherWriteInTallies: Tabulation.CandidateTally[] = [];

  for (const candidateTally of Object.values(combinedContestResults.tallies)) {
    if (candidateTally.isWriteIn) {
      if (isNonCandidateWriteInTally(candidateTally)) {
        otherWriteInTallies.push(candidateTally);
      } else {
        writeInCandidateTallies.push(candidateTally);
      }
    }
  }

  // list write-in candidates first, then other write-in counts
  for (const candidateTally of [
    ...writeInCandidateTallies.map(addWriteInLabelToName),
    ...otherWriteInTallies,
  ]) {
    rows.push({
      ...candidateTally,
      tally:
        contestResults.tallies[candidateTally.id]?.tally ?? 0,
      manualTally: separateManualContestResults?.tallies[candidateTally.id]?.tally ?? 0,
    });
  }

  return rows;
}

function getInsignificantWriteInCount({
  contestResults,
  significantWriteInCandidateIds,
}: {
  contestResults: Tabulation.CandidateContestResults;
  significantWriteInCandidateIds: CandidateId[];
}): number {
  return iter(Object.values(contestResults.tallies))
    .filter(
      (candidateTally) =>
        candidateTally.isWriteIn &&
        !isNonCandidateWriteInTally(candidateTally) &&
        !significantWriteInCandidateIds.includes(candidateTally.id)
    )
    .map((candidateTally) => candidateTally.tally)
    .sum();
}

function getAggregatedWriteInRows({
  contest,
  combinedContestResults,
  contestResults,
  separateManualContestResults,
}: {
  contest: CandidateContest;
  combinedContestResults: Tabulation.CandidateContestResults;
  contestResults: Tabulation.CandidateContestResults;
  separateManualContestResults?: Tabulation.CandidateContestResults;
}): SeparatedTallyReportCandidateRow[] {
  const candidateTalliesDescending = Object.values(
    combinedContestResults.tallies
  )
    .sort(
      (a: Tabulation.CandidateTally, b: Tabulation.CandidateTally) =>
        -(a.tally - b.tally) // sort by descending vote tally
    )
    .filter((candidateTally) => !isNonCandidateWriteInTally(candidateTally));

  // The least number of votes for someone is winning the race. Notes:
  // - winner may change as more results are imported or adjudicated
  // - winner may not be the overall election winner if the report is filtered
  // - with multiple seats, multiple candidates will be winners
  const leastNumberVotesForWinner: number =
    candidateTalliesDescending.at(contest.seats - 1)?.tally ?? 0;

  const significantWriteInCandidates = candidateTalliesDescending.filter(
    (candidateTally) =>
      candidateTally.isWriteIn &&
      candidateTally.tally >= leastNumberVotesForWinner
  );

  const rows: SeparatedTallyReportCandidateRow[] = [];
  let hasSomeWriteInRow = false;

  // each significant write-in candidate gets its own row
  for (const candidate of significantWriteInCandidates) {
    hasSomeWriteInRow = true;
    rows.push({
      ...addWriteInLabelToName(candidate),
      tally: contestResults.tallies[candidate.id]?.tally ?? 0,
      manualTally: separateManualContestResults?.tallies[candidate.id]?.tally ?? 0,
    });
  }

  // bucket insignificant write-ins together
  const significantWriteInCandidateIds = significantWriteInCandidates.map(
    (c) => c.id
  );
  const insignificantWriteInCount = getInsignificantWriteInCount({
    contestResults: contestResults,
    significantWriteInCandidateIds,
  });
  const separateManualInsignificantWriteInCount = separateManualContestResults
    ? getInsignificantWriteInCount({
        contestResults: separateManualContestResults,
        significantWriteInCandidateIds,
      })
    : 0;
  if (
    insignificantWriteInCount > 0 ||
    separateManualInsignificantWriteInCount > 0
  ) {
    hasSomeWriteInRow = true;
    rows.push({
      id: 'write-in-other',
      name:
        significantWriteInCandidateIds.length > 0
          ? 'Other Write-In'
          : Tabulation.GENERIC_WRITE_IN_NAME,
      tally: insignificantWriteInCount,
      manualTally: separateManualInsignificantWriteInCount,
    });
  }

  // separately include pending or generic write-ins
  const nonCandidateWriteInTallies = Object.values(
    contestResults.tallies
  )
    .filter(isNonCandidateWriteInTally)
    .filter((ct) => ct.tally > 0);
  for (const nonCandidateWriteInTally of nonCandidateWriteInTallies) {
    hasSomeWriteInRow = true;
    rows.push({
      ...nonCandidateWriteInTally,
      tally: nonCandidateWriteInTally.tally,
      manualTally: 0,
    });
  }

  // if the contest allows write-ins but there are not any rows showing
  // write-in data, add a placeholder row
  if (!hasSomeWriteInRow && contest.allowWriteIns) {
    rows.push({
      ...Tabulation.GENERIC_WRITE_IN_CANDIDATE,
      tally: 0,
      manualTally: 0,
    });
  }

  return rows;
}

function getCandidateRows({
  contest,
  contestResults,
  separateManualContestResults,
  aggregateInsignificantWriteIns,
}: {
  contest: CandidateContest;
  contestResults: Tabulation.CandidateContestResults;
  separateManualContestResults?: Tabulation.CandidateContestResults;
  aggregateInsignificantWriteIns: boolean;
}): SeparatedTallyReportCandidateRow[] {
  const combinedContestResults = separateManualContestResults
    ? combineCandidateContestResults({
        contest,
        allContestResults: [contestResults, separateManualContestResults],
      })
    : contestResults;

  const rows: SeparatedTallyReportCandidateRow[] = [];

  // official candidates are always listed, in election definition order
  for (const candidate of contest.candidates) {
    rows.push({
      ...candidate,
      tally: assertDefined(contestResults.tallies[candidate.id])
        .tally,
      manualTally: separateManualContestResults?.tallies[candidate.id]?.tally ?? 0,
    });
  }

  if (aggregateInsignificantWriteIns) {
    rows.push(
      ...getAggregatedWriteInRows({
        contest,
        combinedContestResults,
        contestResults,
        separateManualContestResults,
      })
    );
  } else {
    rows.push(
      ...getAllWriteInRows({
        combinedContestResults,
        contestResults,
        separateManualContestResults,
      })
    );
  }

  return rows;
}

/**
 * Rows for a tally report that shows a single column of tallies.
 */
export function getTallyReportCandidateRows({
  contest,
  contestResults,
  aggregateInsignificantWriteIns,
}: {
  contest: CandidateContest;
  contestResults: Tabulation.CandidateContestResults;
  aggregateInsignificantWriteIns: boolean;
}): TallyReportCandidateRow[] {
  return getCandidateRows({
    contest,
    contestResults,
    aggregateInsignificantWriteIns,
  }).map(({ manualTally, ...row }) => row);
}

/**
 * Rows for a tally report that shows the manually entered tallies in their own
 * column, alongside the tallies they were entered to supplement.
 */
export function getSeparatedTallyReportCandidateRows({
  contest,
  contestResults,
  separateManualContestResults,
  aggregateInsignificantWriteIns,
}: {
  contest: CandidateContest;
  contestResults: Tabulation.CandidateContestResults;
  separateManualContestResults: Tabulation.CandidateContestResults;
  aggregateInsignificantWriteIns: boolean;
}): SeparatedTallyReportCandidateRow[] {
  return getCandidateRows({
    contest,
    contestResults,
    separateManualContestResults,
    aggregateInsignificantWriteIns,
  });
}

// for testing only
export function shorthandTallyReportCandidateRow(
  row: TallyReportCandidateRow
): [id: string, name: string, tally: number] {
  return [row.id, row.name, row.tally];
}

// for testing only
export function shorthandSeparatedTallyReportCandidateRow(
  row: SeparatedTallyReportCandidateRow
): [id: string, name: string, tally: number, manualTally: number] {
  return [row.id, row.name, row.tally, row.manualTally];
}
