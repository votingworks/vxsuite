import { test, expect } from 'vitest';
import { Election } from '@votingworks/types';
import { stringify } from 'csv-stringify/sync';
import { range, throwIllegalValue } from '@votingworks/basics';
import { readFixture } from '../test/helpers';
import { convertMsElection } from './convert_ms_election';
import {
  AllPrecinctsTallyReportRow,
  convertMsResults,
} from './convert_ms_results';

function generateAllPrecinctsTallyReport(election: Election): string {
  const rows: AllPrecinctsTallyReportRow[] = election.precincts.flatMap(
    (precinct) =>
      election.contests.flatMap((contest, contestIndex) => {
        const rowBase = {
          precinct: precinct.name,
          precinctId: precinct.id,
          contest: contest.title,
          contestId: contest.id,
        } as const;
        switch (contest.type) {
          case 'candidate': {
            return [
              ...contest.candidates.map((candidate, candidateIndex) => ({
                ...rowBase,
                selection: candidate.name,
                selectionId: candidate.id,
                totalVotes: `${candidateIndex}`,
              })),
              ...(contest.allowWriteIns
                ? range(0, 3).map((writeInIndex) => ({
                    ...rowBase,
                    selection: `Write-in ${writeInIndex + 1}`,
                    selectionId: `write-in-${writeInIndex + 1}`,
                    totalVotes: `${writeInIndex}`,
                  }))
                : []),
              {
                ...rowBase,
                selection: 'Overvotes',
                selectionId: 'overvotes',
                totalVotes: `${contestIndex}`,
              },
              {
                ...rowBase,
                selection: 'Undervotes',
                selectionId: 'undervotes',
                totalVotes: `${contestIndex}`,
              },
            ];
          }
          case 'yesno': {
            return [
              {
                precinct: precinct.name,
                precinctId: precinct.id,
                contest: contest.title,
                contestId: contest.id,
                selection: contest.yesOption.label,
                selectionId: contest.yesOption.id,
                totalVotes: `${contestIndex}`,
              },
              {
                precinct: precinct.name,
                precinctId: precinct.id,
                contest: contest.title,
                contestId: contest.id,
                selection: contest.noOption.label,
                selectionId: contest.noOption.id,
                totalVotes: `${contestIndex + 1}`,
              },
            ];
          }
          default: {
            return throwIllegalValue(contest);
          }
        }
      })
  );
  return stringify(rows, {
    header: true,
    columns: {
      precinct: 'Precinct',
      precinctId: 'Precinct ID',
      contest: 'Contest',
      contestId: 'Contest ID',
      selection: 'Selection',
      selectionId: 'Selection ID',
      totalVotes: 'Total Votes',
    },
  });
}

test('convert general election results', async () => {
  const election = convertMsElection(
    'election-id-1',
    await readFixture('ms-sems-election-general-ballot-measures-10.csv'),
    await readFixture(
      'ms-sems-election-candidates-general-ballot-measures-10.csv'
    )
  );
  const allPrecinctsTallyReportContents =
    generateAllPrecinctsTallyReport(election);
  const resultsCsv = convertMsResults(
    election,
    allPrecinctsTallyReportContents
  );
  expect(resultsCsv).toMatchSnapshot();
  expect(resultsCsv.endsWith('\r\n')).toEqual(false); // Trailing newline is not allowed
});

test('convert primary election results', async () => {
  const election = convertMsElection(
    'election-id-2',
    await readFixture('ms-sems-election-primary-60.csv'),
    await readFixture('ms-sems-election-candidates-primary-60.csv')
  );
  const allPrecinctsTallyReportContents =
    generateAllPrecinctsTallyReport(election);
  const resultsCsv = convertMsResults(
    election,
    allPrecinctsTallyReportContents
  );
  expect(resultsCsv).toMatchSnapshot();
});
