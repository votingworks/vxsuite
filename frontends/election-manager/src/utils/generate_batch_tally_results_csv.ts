import {
  ALL_PARTY_FILTER,
  filterTalliesByParamsAndBatchId,
} from '@votingworks/utils';
import {
  Election,
  expandEitherNeitherContests,
  writeInCandidate,
  FullElectionTally,
  TallyCategory,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';

export function* generateRowsForBatchTallyResultsCsv(
  fullElectionTally: FullElectionTally,
  election: Election
): Generator<string> {
  const batchResults = fullElectionTally.resultsByCategory.get(
    TallyCategory.Batch
  );
  assert(batchResults);
  for (const batchId of Object.keys(batchResults)) {
    const batchTally = filterTalliesByParamsAndBatchId(
      fullElectionTally,
      election,
      batchId,
      {},
      { contestPartyFilter: ALL_PARTY_FILTER }
    );
    const contestVoteTotals: string[] = [];
    for (const contest of expandEitherNeitherContests(election.contests)) {
      const contestTally = batchTally.contestTallies[contest.id];
      contestVoteTotals.push(contestTally?.metadata.ballots.toString() ?? '0');
      contestVoteTotals.push(
        contestTally?.metadata.undervotes.toString() ?? '0'
      );
      contestVoteTotals.push(
        contestTally?.metadata.overvotes.toString() ?? '0'
      );
      if (contest.type === 'candidate') {
        for (const candidate of contest.candidates) {
          contestVoteTotals.push(
            contestTally?.tallies[candidate.id]?.tally.toString() ?? '0'
          );
        }
        if (contest.allowWriteIns) {
          contestVoteTotals.push(
            contestTally?.tallies[writeInCandidate.id]?.tally.toString() ?? '0'
          );
        }
      } else if (contest.type === 'yesno') {
        contestVoteTotals.push(
          contestTally?.tallies['yes']?.tally.toString() ?? '0'
        );
        contestVoteTotals.push(
          contestTally?.tallies['no']?.tally.toString() ?? '0'
        );
      }
    }
    const row = [
      batchId,
      batchTally.batchLabel,
      batchTally.scannerIds.join(', '),
      batchTally.numberOfBallotsCounted,
      ...contestVoteTotals,
    ];
    yield row.join(',');
  }
}

export function generateHeaderRowForBatchResultsCsv(
  election: Election
): string {
  const contestSelectionHeaders: string[] = [];
  for (const contest of expandEitherNeitherContests(election.contests)) {
    let contestTitle = contest.title;
    if (contest.partyId) {
      const party = election.parties.find((p) => p.id === contest.partyId);
      if (party) {
        contestTitle = `${party.fullName} ${contestTitle}`;
      }
    }
    contestTitle = contestTitle.replace(/[^a-z0-9 _-]+/gi, ' ').trim();
    contestSelectionHeaders.push(`"${contestTitle} - Ballots Cast"`);
    contestSelectionHeaders.push(`"${contestTitle} - Undervotes"`);
    contestSelectionHeaders.push(`"${contestTitle} - Overvotes"`);
    if (contest.type === 'candidate') {
      for (const candidate of contest.candidates) {
        contestSelectionHeaders.push(`"${contestTitle} - ${candidate.name}"`);
      }
      if (contest.allowWriteIns) {
        contestSelectionHeaders.push(`"${contestTitle} - Write In"`);
      }
    } else if (contest.type === 'yesno') {
      contestSelectionHeaders.push(`"${contestTitle} - Yes"`);
      contestSelectionHeaders.push(`"${contestTitle} - No"`);
    }
  }
  const headers = [
    'Batch ID',
    'Batch Name',
    'Tabulator',
    'Number of Ballots',
    ...contestSelectionHeaders,
  ];
  return headers.join(',');
}

/**
 *
 * Converts a tally for an election to a CSV file (represented as a string) of tally results
 * broken down by scanning batch.
 * @param fullElectionTally A tally for an election
 * @param election The election schema for the associated tally
 * @returns string file content for a CSV file with tally results broken down by scanning batch
 * CSV File format:
 * One row for every batch, in addition to a headers row.
 * Columns for every possible contest selection in every contest.
 * | Batch ID | Batch Name | Tabulator | Number Of Ballots | Contest 1 - Ballots Cast | Contest 1 - Undervotes | Contest 1 - Overvotes | Contest 1 - Selection Option 1 | ... | Contest N - Selection Option M |
 */
export function generateBatchTallyResultsCsv(
  fullElectionTally: FullElectionTally,
  election: Election
): string {
  let finalDataString = generateHeaderRowForBatchResultsCsv(election);
  for (const rowCsvString of generateRowsForBatchTallyResultsCsv(
    fullElectionTally,
    election
  )) {
    finalDataString += `\n${rowCsvString}`;
  }

  return finalDataString;
}
