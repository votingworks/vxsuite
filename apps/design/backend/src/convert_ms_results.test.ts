import { test, expect } from 'vitest';
import { stringify } from 'csv-stringify/sync';
import { parse } from 'csv-parse/sync';
import { err } from '@votingworks/basics';
import {
  generateAllPrecinctsTallyReport,
  generateAllPrecinctsTallyReportRows,
  readFixture,
  stringifyAllPrecinctsTallyReportRows,
} from '../test/helpers';
import { convertMsElection } from './convert_ms_election';
import {
  convertMsResults,
  SEMS_RESULTS_COLUMNS,
  SemsResultsRow,
} from './convert_ms_results';

const generalElection = convertMsElection(
  'election-id-1',
  readFixture('ms-sems-election-general-ballot-measures-10.csv'),
  readFixture('ms-sems-election-candidates-general-ballot-measures-10.csv')
);

const primaryElection = convertMsElection(
  'election-id-2',
  readFixture('ms-sems-election-primary-60.csv'),
  readFixture('ms-sems-election-candidates-primary-60.csv')
);

test('convert general election results', () => {
  const allPrecinctsTallyReportContents =
    generateAllPrecinctsTallyReport(generalElection);
  const resultsCsv = convertMsResults(
    generalElection,
    allPrecinctsTallyReportContents
  ).unsafeUnwrap();
  expect(resultsCsv).toMatchSnapshot();
  expect(resultsCsv.endsWith('\r\n')).toEqual(false); // Trailing newline is not allowed

  const resultsRows: SemsResultsRow[] = parse(resultsCsv, {
    columns: [...SEMS_RESULTS_COLUMNS],
    relaxColumnCount: true,
  });
  for (const row of resultsRows) {
    // Make sure write-in aggregation works
    if (row.candidateId === '0') {
      // Mock tally report has 3 write-ins with 1 vote each
      expect(row.voteCount).toEqual('3');
    }
  }
});

test('convert primary election results', () => {
  const allPrecinctsTallyReportContents =
    generateAllPrecinctsTallyReport(primaryElection);
  const resultsCsv = convertMsResults(
    primaryElection,
    allPrecinctsTallyReportContents
  ).unsafeUnwrap();
  expect(resultsCsv).toMatchSnapshot();
});

test('errors on missing column headers', () => {
  const rows = generateAllPrecinctsTallyReportRows(generalElection);
  const invalidReport = stringify(rows, {
    header: true,
    // Omit precinct columns
    columns: {
      contest: 'Contest',
      contestId: 'Contest ID',
      selection: 'Selection',
      selectionId: 'Selection ID',
      totalVotes: 'Total Votes',
    },
  });
  expect(convertMsResults(generalElection, invalidReport)).toEqual(
    err('invalid-headers')
  );
});

test('errors on mismatched precincts', () => {
  const rows = generateAllPrecinctsTallyReportRows(generalElection).filter(
    (row) => row.precinctId !== generalElection.precincts[0].id
  );
  const invalidReport = stringifyAllPrecinctsTallyReportRows(rows);
  expect(convertMsResults(generalElection, invalidReport)).toEqual(
    err('report-precincts-mismatch')
  );
});

test('errors on mismatched contests', () => {
  const rows = generateAllPrecinctsTallyReportRows(generalElection).filter(
    (row) => row.contestId !== generalElection.contests[0].id
  );
  const invalidReport = stringifyAllPrecinctsTallyReportRows(rows);
  expect(convertMsResults(generalElection, invalidReport)).toEqual(
    err('report-contests-mismatch')
  );
});
