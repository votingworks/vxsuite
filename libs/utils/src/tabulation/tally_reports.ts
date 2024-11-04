import {
  Candidate,
  CandidateContest,
  CandidateId,
  Tabulation,
} from '@votingworks/types';
import { assertDefined, iter } from '@votingworks/basics';
import { combineCandidateContestResults } from './tabulation';

type TallyReportCandidateRow = Candidate & {
  scannedTally: number;
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
  scannedContestResults,
  manualContestResults,
}: {
  combinedContestResults: Tabulation.CandidateContestResults;
  scannedContestResults: Tabulation.CandidateContestResults;
  manualContestResults?: Tabulation.CandidateContestResults;
}): TallyReportCandidateRow[] {
  const rows: TallyReportCandidateRow[] = [];
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
      scannedTally:
        scannedContestResults.tallies[candidateTally.id]?.tally ?? 0,
      manualTally: manualContestResults?.tallies[candidateTally.id]?.tally ?? 0,
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
  scannedContestResults,
  manualContestResults,
}: {
  contest: CandidateContest;
  combinedContestResults: Tabulation.CandidateContestResults;
  scannedContestResults: Tabulation.CandidateContestResults;
  manualContestResults?: Tabulation.CandidateContestResults;
}): TallyReportCandidateRow[] {
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

  const writeInCandidateTalliesDescending = candidateTalliesDescending.filter(
    (candidateTally) => candidateTally.isWriteIn
  );
  const significantWriteInCandidates: Tabulation.CandidateTally[] = [];

  while (
    significantWriteInCandidates.length <
      writeInCandidateTalliesDescending.length &&
    getInsignificantWriteInCount({
      contestResults: combinedContestResults,
      significantWriteInCandidateIds: significantWriteInCandidates.map(
        (c) => c.id
      ),
    }) >= leastNumberVotesForWinner
  ) {
    significantWriteInCandidates.push(
      assertDefined(
        writeInCandidateTalliesDescending[significantWriteInCandidates.length]
      )
    );
  }

  const rows: TallyReportCandidateRow[] = [];
  let hasSomeWriteInRow = false;

  // each significant write-in candidate gets its own row
  for (const candidate of significantWriteInCandidates) {
    hasSomeWriteInRow = true;
    rows.push({
      ...addWriteInLabelToName(candidate),
      scannedTally: scannedContestResults.tallies[candidate.id]?.tally ?? 0,
      manualTally: manualContestResults?.tallies[candidate.id]?.tally ?? 0,
    });
  }

  // bucket insignificant write-ins together
  const significantWriteInCandidateIds = significantWriteInCandidates.map(
    (c) => c.id
  );
  const scannedInsignificantWriteInCount = getInsignificantWriteInCount({
    contestResults: scannedContestResults,
    significantWriteInCandidateIds,
  });
  const manualInsignificantWriteInCount = manualContestResults
    ? getInsignificantWriteInCount({
        contestResults: manualContestResults,
        significantWriteInCandidateIds,
      })
    : 0;
  if (
    scannedInsignificantWriteInCount > 0 ||
    manualInsignificantWriteInCount > 0
  ) {
    hasSomeWriteInRow = true;
    rows.push({
      id: 'write-in-other',
      name:
        significantWriteInCandidateIds.length > 0
          ? 'Other Write-In'
          : Tabulation.GENERIC_WRITE_IN_NAME,
      scannedTally: scannedInsignificantWriteInCount,
      manualTally: manualInsignificantWriteInCount,
    });
  }

  // separately include pending or generic write-ins
  const nonCandidateWriteInTallies = Object.values(
    scannedContestResults.tallies
  )
    .filter(isNonCandidateWriteInTally)
    .filter((ct) => ct.tally > 0);
  for (const nonCandidateWriteInTally of nonCandidateWriteInTallies) {
    hasSomeWriteInRow = true;
    rows.push({
      ...nonCandidateWriteInTally,
      scannedTally: nonCandidateWriteInTally.tally,
      manualTally: 0,
    });
  }

  // if the contest allows write-ins but there are not any rows showing
  // write-in data, add a placeholder row
  if (!hasSomeWriteInRow && contest.allowWriteIns) {
    rows.push({
      ...Tabulation.GENERIC_WRITE_IN_CANDIDATE,
      scannedTally: 0,
      manualTally: 0,
    });
  }

  return rows;
}

export function getTallyReportCandidateRows({
  contest,
  scannedContestResults,
  manualContestResults,
  aggregateInsignificantWriteIns,
}: {
  contest: CandidateContest;
  scannedContestResults: Tabulation.CandidateContestResults;
  manualContestResults?: Tabulation.CandidateContestResults;
  aggregateInsignificantWriteIns: boolean;
}): TallyReportCandidateRow[] {
  const combinedContestResults = manualContestResults
    ? combineCandidateContestResults({
        contest,
        allContestResults: [scannedContestResults, manualContestResults],
      })
    : scannedContestResults;

  const rows: TallyReportCandidateRow[] = [];

  // official candidates are always listed, in election definition order
  for (const candidate of contest.candidates) {
    rows.push({
      ...candidate,
      scannedTally: assertDefined(scannedContestResults.tallies[candidate.id])
        .tally,
      manualTally: manualContestResults?.tallies[candidate.id]?.tally ?? 0,
    });
  }

  if (aggregateInsignificantWriteIns) {
    rows.push(
      ...getAggregatedWriteInRows({
        contest,
        combinedContestResults,
        scannedContestResults,
        manualContestResults,
      })
    );
  } else {
    rows.push(
      ...getAllWriteInRows({
        combinedContestResults,
        scannedContestResults,
        manualContestResults,
      })
    );
  }

  return rows;
}

// for testing only
export function shorthandTallyReportCandidateRow(
  row: TallyReportCandidateRow
): [id: string, name: string, scannedTally: number, manualTally: number] {
  return [row.id, row.name, row.scannedTally, row.manualTally];
}
