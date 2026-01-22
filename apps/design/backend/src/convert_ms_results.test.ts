import { test, expect } from 'vitest';
import { stringify } from 'csv-stringify/sync';
import { parse } from 'csv-parse/sync';
import { err } from '@votingworks/basics';
import { safeParseElectionDefinition } from '@votingworks/types';
import {
  generateAllPrecinctsTallyReport,
  generateAllPrecinctsTallyReportMetadataRow,
  generateAllPrecinctsTallyReportRows,
  generateAllPrecinctsTallyReportWithManualTallies,
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
const generalElectionDefinition = safeParseElectionDefinition(
  JSON.stringify({
    ...generalElection,
    // Add a dummy ballot style to satisfy validation
    ballotStyles: [
      { id: 'dummy', groupId: 'dummy', precincts: [], districts: [] },
    ],
  })
).unsafeUnwrap();

const primaryElection = convertMsElection(
  'election-id-2',
  readFixture('ms-sems-election-primary-60.csv'),
  readFixture('ms-sems-election-candidates-primary-60.csv')
);
const primaryElectionDefinition = safeParseElectionDefinition(
  JSON.stringify({
    ...primaryElection,
    // Add a dummy ballot style to satisfy validation
    ballotStyles: [
      { id: 'dummy', groupId: 'dummy', precincts: [], districts: [] },
    ],
  })
).unsafeUnwrap();

test('convert general election results', () => {
  const allPrecinctsTallyReportContents = generateAllPrecinctsTallyReport(
    generalElectionDefinition
  );
  const resultsCsv = convertMsResults(
    generalElectionDefinition,
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

test('convert general election results with manual tallies', () => {
  const allPrecinctsTallyReportContents = generateAllPrecinctsTallyReport(
    generalElectionDefinition
  );
  const allPrecinctsTallyReportContentsWithManualTallies =
    generateAllPrecinctsTallyReportWithManualTallies(generalElectionDefinition);

  const resultsCsv = convertMsResults(
    generalElectionDefinition,
    allPrecinctsTallyReportContents
  ).unsafeUnwrap();
  const resultsCsvWithManualTallies = convertMsResults(
    generalElectionDefinition,
    allPrecinctsTallyReportContentsWithManualTallies
  ).unsafeUnwrap();

  expect(resultsCsv).toEqual(resultsCsvWithManualTallies);
});

test('convert primary election results', () => {
  const allPrecinctsTallyReportContents = generateAllPrecinctsTallyReport(
    primaryElectionDefinition
  );
  const resultsCsv = convertMsResults(
    primaryElectionDefinition,
    allPrecinctsTallyReportContents
  ).unsafeUnwrap();
  expect(resultsCsv).toMatchSnapshot();
});

test('errors on wrong election', () => {
  const allPrecinctsTallyReportContents = generateAllPrecinctsTallyReport(
    generalElectionDefinition
  );
  expect(
    convertMsResults(primaryElectionDefinition, allPrecinctsTallyReportContents)
  ).toEqual(err('wrong-election'));
});

test('errors on wrong tally report', () => {
  const allPrecinctsTallyReportContents = generateAllPrecinctsTallyReport(
    generalElectionDefinition
  );
  const invalidReport = allPrecinctsTallyReportContents.replace(
    'official-tally-report-by-precinct',
    'official-full-election-tally-report'
  );
  expect(convertMsResults(generalElectionDefinition, invalidReport)).toEqual(
    err('wrong-tally-report')
  );
});

test('allows test and unofficial reports', () => {
  const allPrecinctsTallyReportContents = generateAllPrecinctsTallyReport(
    generalElectionDefinition
  );
  const testReport = allPrecinctsTallyReportContents.replace(
    'official-tally-report-by-precinct',
    'TEST-unofficial-tally-report-by-precinct'
  );
  convertMsResults(generalElectionDefinition, testReport).unsafeUnwrap();
});

test('errors on missing column headers', () => {
  const rows = generateAllPrecinctsTallyReportRows(generalElection);
  const invalidReport =
    generateAllPrecinctsTallyReportMetadataRow(generalElectionDefinition) +
    stringify(rows, {
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
  expect(convertMsResults(generalElectionDefinition, invalidReport)).toEqual(
    err('invalid-headers')
  );
});

test('errors on mismatched precincts', () => {
  const rows = generateAllPrecinctsTallyReportRows(generalElection).filter(
    (row) => row.precinctId !== generalElection.precincts[0].id
  );
  const invalidReport =
    generateAllPrecinctsTallyReportMetadataRow(generalElectionDefinition) +
    stringifyAllPrecinctsTallyReportRows(rows);
  expect(convertMsResults(generalElectionDefinition, invalidReport)).toEqual(
    err('report-precincts-mismatch')
  );
});

test('errors on mismatched contests', () => {
  const rows = generateAllPrecinctsTallyReportRows(generalElection).filter(
    (row) => row.contestId !== generalElection.contests[0].id
  );
  const invalidReport =
    generateAllPrecinctsTallyReportMetadataRow(generalElectionDefinition) +
    stringifyAllPrecinctsTallyReportRows(rows);
  expect(convertMsResults(generalElectionDefinition, invalidReport)).toEqual(
    err('report-contests-mismatch')
  );
});
