import { ALL_PARTY_FILTER, filterTalliesByParams } from '@votingworks/shared';
import {
  Election,
  writeInCandidate,
  FullElectionTally,
  VotingMethod,
  Precinct,
  Contest,
} from '@votingworks/types';

function buildCsvRow(
  precinct: Precinct,
  votingMethod: string,
  votes: number | undefined,
  contest: Contest,
  selection: string,
  selectionId?: string
): string {
  return [
    `"${contest.title}"`,
    contest.id,
    `"${selection}"`,
    selectionId ?? '',
    `"${precinct.name}"`,
    precinct.id,
    votingMethod,
    votes?.toString() ?? '0',
  ].join(',');
}

export function* generateRows(
  fullElectionTally: FullElectionTally,
  election: Election
): Generator<string> {
  for (const precinct of election.precincts) {
    const absenteeTally = filterTalliesByParams(
      fullElectionTally,
      election,
      {
        precinctId: precinct.id,
        votingMethod: VotingMethod.Absentee,
      },
      { contestPartyFilter: ALL_PARTY_FILTER }
    );
    const precinctTally = filterTalliesByParams(
      fullElectionTally,
      election,
      {
        precinctId: precinct.id,
        votingMethod: VotingMethod.Precinct,
      },
      { contestPartyFilter: ALL_PARTY_FILTER }
    );
    for (const contest of election.contests) {
      const contestTallyAbsentee = absenteeTally.contestTallies[contest.id];
      const contestTallyPrecinct = precinctTally.contestTallies[contest.id];

      if (contest.type === 'candidate') {
        for (const candidate of contest.candidates) {
          yield buildCsvRow(
            precinct,
            'Absentee',
            contestTallyAbsentee?.tallies[candidate.id]?.tally,
            contest,
            candidate.name,
            candidate.id
          );
          yield buildCsvRow(
            precinct,
            'Precinct',
            contestTallyPrecinct?.tallies[candidate.id]?.tally,
            contest,
            candidate.name,
            candidate.id
          );
        }
        if (contest.allowWriteIns) {
          yield buildCsvRow(
            precinct,
            'Absentee',
            contestTallyAbsentee?.tallies[writeInCandidate.id]?.tally,
            contest,
            writeInCandidate.name,
            writeInCandidate.id
          );
          yield buildCsvRow(
            precinct,
            'Precinct',
            contestTallyPrecinct?.tallies[writeInCandidate.id]?.tally,
            contest,
            writeInCandidate.name,
            writeInCandidate.id
          );
        }
      } else if (contest.type === 'yesno') {
        yield buildCsvRow(
          precinct,
          'Absentee',
          contestTallyAbsentee?.tallies['yes']?.tally,
          contest,
          'Yes',
          contest.yesOption?.id
        );
        yield buildCsvRow(
          precinct,
          'Precinct',
          contestTallyPrecinct?.tallies['yes']?.tally,
          contest,
          'Yes',
          contest.yesOption?.id
        );

        yield buildCsvRow(
          precinct,
          'Absentee',
          contestTallyAbsentee?.tallies['no']?.tally,
          contest,
          'No',
          contest.noOption?.id
        );
        yield buildCsvRow(
          precinct,
          'Precinct',
          contestTallyPrecinct?.tallies['no']?.tally,
          contest,
          'No',
          contest.noOption?.id
        );
      }

      yield buildCsvRow(
        precinct,
        'Absentee',
        contestTallyAbsentee?.metadata.overvotes,
        contest,
        'Overvotes'
      );
      yield buildCsvRow(
        precinct,
        'Precinct',
        contestTallyPrecinct?.metadata.overvotes,
        contest,
        'Overvotes'
      );

      yield buildCsvRow(
        precinct,
        'Absentee',
        contestTallyAbsentee?.metadata.undervotes,
        contest,
        'Undervotes'
      );
      yield buildCsvRow(
        precinct,
        'Precinct',
        contestTallyPrecinct?.metadata.undervotes,
        contest,
        'Undervotes'
      );
    }
  }
}

/**
 *
 * Converts a tally for an election to a CSV file (represented as a string) of tally results
 * broken down by voting method and precinct.
 * @param fullElectionTally A tally for an election
 * @param election The election schema for the associated tally
 * @returns string file content for a CSV file with tally results broken down by scanning batch
 * CSV File format:
 * One row for every batch, in addition to a headers row.
 * Columns for every possible contest selection in every contest.
 * | Precinct Name | Precinct ID | Voting Method | Votes | Contest Name | Contest ID | Selection Name | Selection ID
 */
export function generateResultsCsv(
  fullElectionTally: FullElectionTally,
  election: Election
): string {
  // TODO(https://github.com/votingworks/vxsuite/issues/2631): Omit the voting method column for
  // elections where we can't distinguish between absentee/precinct ballots (e.g. NH). Punted as
  // out-of-scope for the NH pilot.
  let finalDataString = `Contest, Contest ID, Selection, Selection ID, Precinct, Precinct ID, Voting Method, Votes`;
  for (const rowCsvString of generateRows(fullElectionTally, election)) {
    finalDataString += `\n${rowCsvString}`;
  }

  return finalDataString;
}
