import { Candidate, CandidateContest, Tabulation } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
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

export function getTallyReportCandidateRows({
  contest,
  scannedContestResults,
  manualContestResults,
}: {
  contest: CandidateContest;
  scannedContestResults: Tabulation.CandidateContestResults;
  manualContestResults?: Tabulation.CandidateContestResults;
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

  rows.push(
    ...getAllWriteInRows({
      combinedContestResults,
      scannedContestResults,
      manualContestResults,
    })
  );

  return rows;
}

// for testing only
export function shorthandTallyReportCandidateRow(
  row: TallyReportCandidateRow
): [id: string, name: string, scannedTally: number, manualTally: number] {
  return [row.id, row.name, row.scannedTally, row.manualTally];
}
