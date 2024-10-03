import { Buffer } from 'node:buffer';
import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS, Tabulation } from '@votingworks/types';
import { find } from '@votingworks/basics';
import { buildManualResultsFixture } from '@votingworks/utils';
import {
  MockCastVoteRecordFile,
  addMockCvrFileToStore,
} from '../../test/mock_cvr_file';
import { iterableToString, parseCsv } from '../../test/csv';
import { Store } from '../store';
import { generateBallotCountReportCsv } from './csv_ballot_count_report';

test('uses appropriate headers', async () => {
  const store = Store.memoryStore();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { election, electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  // add some mock cast vote records with one vote each
  const mockCastVoteRecordAttributes = {
    ballotStyleId: '1M',
    batchId: 'batch-1',
    scannerId: 'scanner-1',
    precinctId: 'precinct-1',
    votingMethod: 'precinct',
    votes: {},
  } as const;

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ...mockCastVoteRecordAttributes,
      card: { type: 'bmd' },
      multiplier: 1,
    },
    {
      ...mockCastVoteRecordAttributes,
      card: { type: 'hmpb', sheetNumber: 1 },
      multiplier: 2,
    },
    {
      ...mockCastVoteRecordAttributes,
      card: { type: 'hmpb', sheetNumber: 2 },
      multiplier: 2,
    },
  ];
  addMockCvrFileToStore({ electionId, mockCastVoteRecordFile, store });
  store.setManualResults({
    electionId,
    precinctId: 'precinct-1',
    ballotStyleGroupId: '1M',
    votingMethod: 'precinct',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 5,
      contestResultsSummaries: {},
    }),
  });

  const SHARED_ROW_VALUES: Record<string, string> = {
    'Precinct ID': 'precinct-1',
    Precinct: 'Precinct 1',
    'Ballot Style ID': '1M',
    Party: 'Mammal',
    'Party ID': '0',
    'Voting Method': 'Precinct',
    'Batch ID': 'batch-1',
    'Scanner ID': 'scanner-1',
    BMD: '1',
    HMPB: '2',
    Manual: '5',
    Scanned: '3',
    Total: '8',
  };

  const testCases: Array<{
    filter?: Tabulation.Filter;
    groupBy?: Tabulation.GroupBy;
    expectedHeaders: string[];
    additionalRowAttributes?: Record<string, string>;
  }> = [
    // single groupings
    {
      groupBy: { groupByPrecinct: true },
      expectedHeaders: [
        'Precinct',
        'Precinct ID',
        'Manual',
        'BMD',
        'HMPB',
        'Total',
      ],
    },
    {
      groupBy: { groupByParty: true },
      expectedHeaders: ['Party', 'Party ID', 'Manual', 'BMD', 'HMPB', 'Total'],
    },
    {
      groupBy: { groupByVotingMethod: true },
      expectedHeaders: ['Voting Method', 'Manual', 'BMD', 'HMPB', 'Total'],
    },
    // multiple groupings
    {
      groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
      expectedHeaders: [
        'Precinct',
        'Precinct ID',
        'Voting Method',
        'Manual',
        'BMD',
        'HMPB',
        'Total',
      ],
    },
    // single filters
    {
      filter: { ballotStyleIds: ['1M'] },
      expectedHeaders: [
        'Party',
        'Party ID',
        'Ballot Style ID',
        'Manual',
        'BMD',
        'HMPB',
        'Total',
      ],
    },
  ];

  for (const testCase of testCases) {
    const iterable = generateBallotCountReportCsv({
      store,
      filter: testCase.filter,
      groupBy: testCase.groupBy,
      includeSheetCounts: false,
    });
    const fileContents = await iterableToString(iterable);
    const { headers, rows } = parseCsv(fileContents);
    expect(headers).toEqual([...testCase.expectedHeaders]);

    const row = find(rows, (r) => r['Total'] !== '0');
    const expectedAttributes: Record<string, string> = {
      ...SHARED_ROW_VALUES,
      ...(testCase.additionalRowAttributes || {}),
    };
    for (const [header, value] of Object.entries(row)) {
      expect(value).toEqual(expectedAttributes[header]);
    }
  }
});

test('includes rows for empty but known result groups', async () => {
  const store = Store.memoryStore();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  // no CVRs, so all groups should be empty
  const iterable = generateBallotCountReportCsv({
    store,
    filter: {},
    groupBy: { groupByPrecinct: true },
    includeSheetCounts: false,
  });
  const fileContents = await iterableToString(iterable);
  const { rows } = parseCsv(fileContents);

  find(rows, (r) => r['Precinct'] === 'Precinct 1');
  find(rows, (r) => r['Precinct'] === 'Precinct 2');
});

test('does not include results groups when they are excluded by the filter', async () => {
  const store = Store.memoryStore();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  // grouping on voting method should include both precinct and absentee rows
  const byVotingMethodIterable = generateBallotCountReportCsv({
    store,
    groupBy: { groupByVotingMethod: true },
    includeSheetCounts: false,
  });
  const byVotingMethodFileContents = await iterableToString(
    byVotingMethodIterable
  );
  const { rows: byVotingMethodRows } = parseCsv(byVotingMethodFileContents);
  expect(
    byVotingMethodRows.some((r) => r['Voting Method'] === 'Absentee')
  ).toBeTruthy();
  expect(
    byVotingMethodRows.some((r) => r['Voting Method'] === 'Precinct')
  ).toBeTruthy();

  // but if we add on a filter that excludes absentee, absentee rows should not be included
  const precinctIterable = generateBallotCountReportCsv({
    store,
    groupBy: { groupByVotingMethod: true },
    filter: { votingMethods: ['precinct'] },
    includeSheetCounts: false,
  });
  const precinctFileContests = await iterableToString(precinctIterable);
  const { rows: precinctRows } = parseCsv(precinctFileContests);
  expect(
    precinctRows.some((r) => r['Voting Method'] === 'Absentee')
  ).toBeFalsy();
  expect(
    precinctRows.some((r) => r['Voting Method'] === 'Precinct')
  ).toBeTruthy();
});

test('excludes Manual column if no manual data exists', async () => {
  const store = Store.memoryStore();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  // no CVRs, so all groups should be empty
  const iterable = generateBallotCountReportCsv({
    store,
    filter: {},
    groupBy: { groupByPrecinct: true },
    includeSheetCounts: false,
  });
  const fileContents = await iterableToString(iterable);
  const { headers } = parseCsv(fileContents);

  expect(headers).not.toContain('Manual');
});

test('can include sheet counts', async () => {
  const store = Store.memoryStore();
  const electionDefinition =
    electionFamousNames2021Fixtures.multiSheetElectionDefinition;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  // add some mock cast vote records with one vote each
  const mockCastVoteRecordAttributes = {
    ballotStyleId: '1',
    batchId: 'batch-1',
    scannerId: 'scanner-1',
    votingMethod: 'precinct',
    votes: {},
  } as const;

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ...mockCastVoteRecordAttributes,
      precinctId: '20',
      card: { type: 'bmd' },
      multiplier: 3,
    },
    {
      ...mockCastVoteRecordAttributes,
      precinctId: '20',
      card: { type: 'hmpb', sheetNumber: 1 },
      multiplier: 12,
    },
    {
      ...mockCastVoteRecordAttributes,
      precinctId: '20',
      card: { type: 'hmpb', sheetNumber: 2 },
      multiplier: 10,
    },
    {
      ...mockCastVoteRecordAttributes,
      precinctId: '20',
      card: { type: 'hmpb', sheetNumber: 3 },
      multiplier: 7,
    },
    {
      ...mockCastVoteRecordAttributes,
      precinctId: '23',
      card: { type: 'bmd' },
      multiplier: 9,
    },
    {
      ...mockCastVoteRecordAttributes,
      precinctId: '23',
      card: { type: 'hmpb', sheetNumber: 1 },
      multiplier: 11,
    },
    {
      ...mockCastVoteRecordAttributes,
      precinctId: '23',
      card: { type: 'hmpb', sheetNumber: 2 },
      multiplier: 11,
    },
    {
      ...mockCastVoteRecordAttributes,
      precinctId: '23',
      card: { type: 'hmpb', sheetNumber: 3 },
      multiplier: 10,
    },
  ];
  addMockCvrFileToStore({ electionId, mockCastVoteRecordFile, store });

  const iterable = generateBallotCountReportCsv({
    store,
    groupBy: { groupByPrecinct: true },
    includeSheetCounts: true,
  });
  const fileContents = await iterableToString(iterable);
  const { headers, rows } = parseCsv(fileContents);
  expect(headers).toEqual([
    'Precinct',
    'Precinct ID',
    'BMD',
    'HMPB',
    'HMPB Sheet 2',
    'HMPB Sheet 3',
    'Total',
  ]);

  expect(rows).toEqual([
    {
      BMD: '3',
      HMPB: '12',
      'HMPB Sheet 2': '10',
      'HMPB Sheet 3': '7',
      Precinct: 'West Lincoln',
      'Precinct ID': '20',
      Total: '15',
    },
    {
      BMD: '0',
      HMPB: '0',
      'HMPB Sheet 2': '0',
      'HMPB Sheet 3': '0',
      Precinct: 'East Lincoln',
      'Precinct ID': '21',
      Total: '0',
    },
    {
      BMD: '0',
      HMPB: '0',
      'HMPB Sheet 2': '0',
      'HMPB Sheet 3': '0',
      Precinct: 'South Lincoln',
      'Precinct ID': '22',
      Total: '0',
    },
    {
      BMD: '9',
      HMPB: '11',
      'HMPB Sheet 2': '11',
      'HMPB Sheet 3': '10',
      Precinct: 'North Lincoln',
      'Precinct ID': '23',
      Total: '20',
    },
  ]);
});
